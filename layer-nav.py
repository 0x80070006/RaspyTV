#!/usr/bin/env python3
import ctypes
import json
import os
import signal
import socket
import sys

parent_pid = os.getppid()
ctypes.CDLL(None).prctl(1, signal.SIGTERM, 0, 0, 0)
if parent_pid == 1 or os.getppid() != parent_pid:
    sys.exit(0)

import gi
gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
gi.require_version('GdkPixbuf', '2.0')
gi.require_version('GtkLayerShell', '0.1')
from gi.repository import Gdk, GdkPixbuf, GLib, Gtk, GtkLayerShell

SOCKET_PATH, STATE_PATH = sys.argv[1:3]
state_mtime = 0
collapse_timer = volume_timer = fade_tick = volume_fade_tick = None
expanded = False
drawer_kind = None
current_data = {}
last_volume = None
volume_progress = volume_label = None

window = Gtk.Window(type=Gtk.WindowType.TOPLEVEL)
window.set_decorated(False)
window.set_resizable(True)
window.set_accept_focus(False)
window.set_focus_on_map(False)
visual = window.get_screen().get_rgba_visual()
if visual:
    window.set_visual(visual)
window.set_app_paintable(True)
GtkLayerShell.init_for_window(window)
GtkLayerShell.set_layer(window, GtkLayerShell.Layer.OVERLAY)
GtkLayerShell.set_anchor(window, GtkLayerShell.Edge.LEFT, True)
GtkLayerShell.set_anchor(window, GtkLayerShell.Edge.TOP, True)
GtkLayerShell.set_anchor(window, GtkLayerShell.Edge.BOTTOM, True)
GtkLayerShell.set_exclusive_zone(window, 0)
GtkLayerShell.set_keyboard_mode(window, GtkLayerShell.KeyboardMode.NONE)

volume_window = Gtk.Window(type=Gtk.WindowType.TOPLEVEL)
volume_window.set_decorated(False)
volume_window.set_resizable(False)
volume_window.set_accept_focus(False)
volume_window.set_focus_on_map(False)
if visual:
    volume_window.set_visual(visual)
volume_window.set_app_paintable(True)
GtkLayerShell.init_for_window(volume_window)
GtkLayerShell.set_layer(volume_window, GtkLayerShell.Layer.OVERLAY)
GtkLayerShell.set_anchor(volume_window, GtkLayerShell.Edge.BOTTOM, True)
GtkLayerShell.set_margin(volume_window, GtkLayerShell.Edge.BOTTOM, 54)
GtkLayerShell.set_exclusive_zone(volume_window, 0)
GtkLayerShell.set_keyboard_mode(volume_window, GtkLayerShell.KeyboardMode.NONE)

css = Gtk.CssProvider()
css.load_from_data(b'''window,.hotspot,.shell{background:transparent}.panel{background:rgba(11,14,24,.965);border:1px solid rgba(255,255,255,.14);border-left:0;border-radius:0 23px 23px 0;padding:14px 9px 14px 18px}.drawer{min-width:218px;background:rgba(15,18,29,.975);border:1px solid rgba(255,255,255,.14);border-left:0;border-radius:0 21px 21px 0;padding:13px 12px}.drawer-title{color:#919db4;font-size:11px;font-weight:700;padding:3px 7px 9px}.nav-button{min-width:46px;min-height:46px;border:0;border-radius:13px;padding:7px;background:transparent;color:#dce5ff}.nav-button:hover,.nav-button.active{background:rgba(255,255,255,.13)}.category-button{color:#aebcff;font-size:20px}.keyboard-button{color:#7ff0ae}.keyboard-button.active{background:rgba(40,102,73,.8)}.volume-button{color:#ffd889;font-size:23px}.settings-button{color:#e8edf8}.drawer-button{min-width:194px;min-height:45px;border:0;border-radius:12px;padding:6px 10px;background:transparent;color:#e8edf8}.drawer-button:hover,.drawer-button.active{background:rgba(255,255,255,.12)}.drawer-button label{padding-left:9px}.volume-osd{min-width:410px;min-height:64px;padding:12px 18px;border:1px solid rgba(255,255,255,.17);border-radius:18px;background:rgba(8,11,19,.94)}.volume-osd .volume-icon{color:#ffd889;font-size:18px;font-weight:700}.volume-osd .volume-value{min-width:45px;color:#fff;font-size:14px;font-weight:700}.volume-osd progressbar trough{min-width:280px;min-height:7px;border-radius:7px;background:rgba(255,255,255,.18)}.volume-osd progressbar progress{min-height:7px;border-radius:7px;background:#ffd889}separator{min-height:1px;background:rgba(255,255,255,.11);margin:2px 5px}''')
Gtk.StyleContext.add_provider_for_screen(window.get_screen(), css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)

volume_osd = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=13)
volume_osd.get_style_context().add_class('volume-osd')
volume_icon = Gtk.Label(label='VOL')
volume_icon.get_style_context().add_class('volume-icon')
volume_progress = Gtk.ProgressBar()
volume_label = Gtk.Label(label='0%')
volume_label.get_style_context().add_class('volume-value')
volume_osd.pack_start(volume_icon, False, False, 0)
volume_osd.pack_start(volume_progress, True, True, 0)
volume_osd.pack_start(volume_label, False, False, 0)
volume_window.add(volume_osd)

hotspot = Gtk.EventBox()
hotspot.set_visible_window(True)
hotspot.set_hexpand(True)
hotspot.set_vexpand(True)
display = Gdk.Display.get_default()
monitor = display.get_primary_monitor() or display.get_monitor(0)
screen_height = monitor.get_geometry().height if monitor else 1080
hotspot.set_size_request(20, screen_height)
hotspot.get_style_context().add_class('hotspot')
shell = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=0)
shell.get_style_context().add_class('shell')
panel = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=7)
panel.set_valign(Gtk.Align.CENTER)
panel.get_style_context().add_class('panel')
drawer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
drawer.set_valign(Gtk.Align.CENTER)
drawer.get_style_context().add_class('drawer')
shell.pack_start(panel, False, False, 0)
shell.pack_start(drawer, False, False, 0)
hotspot.add(shell)
window.add(hotspot)

def send(command):
    try:
        client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        client.settimeout(.7)
        client.connect(SOCKET_PATH)
        client.sendall(json.dumps(command).encode('utf-8'))
        client.shutdown(socket.SHUT_WR)
        client.close()
    except OSError:
        pass

def clear_box(box):
    for child in box.get_children():
        box.remove(child)

def icon_widget(icon_path, fallback, size=31):
    if icon_path and os.path.isfile(icon_path):
        try:
            return Gtk.Image.new_from_pixbuf(GdkPixbuf.Pixbuf.new_from_file_at_scale(icon_path, size, size, True))
        except GLib.Error:
            pass
    label = Gtk.Label(label=fallback[:1].upper())
    label.set_markup('<b>%s</b>' % GLib.markup_escape_text(fallback[:1].upper()))
    return label

def nav_button(icon_path, fallback, tooltip, command=None, active=False, css_class=None, callback=None):
    item = Gtk.Button()
    item.set_relief(Gtk.ReliefStyle.NONE)
    item.set_tooltip_text(tooltip)
    item.get_style_context().add_class('nav-button')
    if css_class:
        item.get_style_context().add_class(css_class)
    if active:
        item.get_style_context().add_class('active')
    item.add(icon_widget(icon_path, fallback))
    item.connect('clicked', callback if callback else lambda _button: send(command))
    panel.pack_start(item, False, False, 0)

def drawer_button(app_data, active):
    item = Gtk.Button()
    item.set_relief(Gtk.ReliefStyle.NONE)
    item.get_style_context().add_class('drawer-button')
    if active:
        item.get_style_context().add_class('active')
    content = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=3)
    content.pack_start(icon_widget(app_data.get('icon', ''), app_data.get('name', '?'), 29), False, False, 0)
    label = Gtk.Label(label=app_data.get('name', 'Application'))
    label.set_xalign(0)
    content.pack_start(label, True, True, 0)
    item.add(content)
    item.connect('clicked', lambda _button: send({'action': 'launch', 'id': app_data.get('id')}))
    drawer.pack_start(item, False, False, 0)

def update_window_width():
    if expanded:
        width = 306 if drawer_kind else 76
        window.set_size_request(width, -1)
        window.resize(width, screen_height)

def build_drawer():
    clear_box(drawer)
    if not drawer_kind:
        drawer.hide()
        update_window_width()
        return
    native = drawer_kind == 'native'
    title = Gtk.Label(label='APPS NATIVES' if native else 'APPS PERSONNALISEES')
    title.set_xalign(0)
    title.get_style_context().add_class('drawer-title')
    drawer.pack_start(title, False, False, 0)
    apps = [app for app in current_data.get('apps', []) if bool(app.get('native')) == native]
    if apps:
        for app_data in apps:
            drawer_button(app_data, app_data.get('id') == current_data.get('activeId') and not current_data.get('nativeMode'))
    else:
        empty = Gtk.Label(label='Aucune app ajoutee')
        empty.set_xalign(0)
        empty.get_style_context().add_class('drawer-title')
        drawer.pack_start(empty, False, False, 0)
    drawer.show_all()
    update_window_width()

def toggle_drawer(kind):
    global drawer_kind
    drawer_kind = None if drawer_kind == kind else kind
    build_drawer()

def hide_volume_feedback():
    global volume_timer
    volume_timer = None
    fade_volume(0.0)
    return False

def fade_volume(target):
    global volume_fade_tick
    if volume_fade_tick is not None:
        volume_osd.remove_tick_callback(volume_fade_tick)
        volume_fade_tick = None
    if target > 0 and not volume_window.get_visible():
        volume_osd.set_opacity(0.0)
        volume_window.show_all()
    start_opacity = volume_osd.get_opacity()
    duration = 120000 if target > start_opacity else 180000
    started = GLib.get_monotonic_time()
    def tick(_widget, _clock):
        global volume_fade_tick
        progress = min(1.0, (GLib.get_monotonic_time() - started) / duration)
        eased = 1 - (1 - progress) * (1 - progress)
        volume_osd.set_opacity(start_opacity + (target - start_opacity) * eased)
        if progress < 1:
            return True
        volume_fade_tick = None
        if target == 0:
            volume_window.hide()
        return False
    volume_fade_tick = volume_osd.add_tick_callback(tick)

def show_volume_feedback(value):
    global volume_timer
    value = max(0, min(100, int(value)))
    volume_label.set_text('%d%%' % value)
    volume_progress.set_fraction(value / 100.0)
    fade_volume(1.0)
    if volume_timer:
        GLib.source_remove(volume_timer)
    volume_timer = GLib.timeout_add(1500, hide_volume_feedback)

def volume_click(delta):
    base = current_data.get('systemVolume')
    if isinstance(base, (int, float)):
        show_volume_feedback(base + delta)
    send({'action': 'volume', 'delta': delta})

def rebuild(data):
    global current_data, last_volume
    current_data = data
    clear_box(panel)
    app_dir = os.path.dirname(os.path.abspath(__file__))
    active = data.get('activeId') if not data.get('nativeMode') else None
    native_active = any(app.get('native') and app.get('id') == active for app in data.get('apps', []))
    custom_active = any(not app.get('native') and app.get('id') == active for app in data.get('apps', []))
    nav_button(os.path.join(app_dir, 'assets/icons/home.png'), 'H', 'Accueil RaspyTV', {'action': 'home'}, not active and not data.get('nativeMode'))
    nav_button('', '▦', 'Applications natives', active=native_active or drawer_kind == 'native', css_class='category-button', callback=lambda _button: toggle_drawer('native'))
    nav_button('', '✦', 'Applications personnalisees', active=custom_active or drawer_kind == 'custom', css_class='category-button', callback=lambda _button: toggle_drawer('custom'))
    nav_button(os.path.join(app_dir, 'assets/icons/moonlight.svg'), 'M', 'Moonlight', {'action': 'moonlight'}, data.get('nativeMode', False))
    if data.get('nativeMode'):
        nav_button('', 'K', 'Clavier virtuel', {'action': 'keyboard'}, css_class='keyboard-button')
    panel.pack_start(Gtk.Separator(orientation=Gtk.Orientation.HORIZONTAL), False, False, 0)
    nav_button('', '+', 'Augmenter le volume', css_class='volume-button', callback=lambda _button: volume_click(5))
    nav_button('', '-', 'Baisser le volume', css_class='volume-button', callback=lambda _button: volume_click(-5))
    nav_button(os.path.join(app_dir, 'assets/icons/settings.png'), 'S', 'Parametres', {'action': 'settings'}, css_class='settings-button')
    build_drawer()
    if data.get('artMode'):
        window.hide()
        return
    window.show_all()
    if not drawer_kind:
        drawer.hide()
    new_volume = data.get('systemVolume')
    if isinstance(last_volume, (int, float)) and isinstance(new_volume, (int, float)) and int(new_volume) != int(last_volume):
        show_volume_feedback(new_volume)
    if isinstance(new_volume, (int, float)):
        last_volume = new_volume
    if not expanded and fade_tick is None:
        finish_collapse()

def refresh_state():
    global state_mtime
    try:
        modified = os.path.getmtime(STATE_PATH)
        if modified != state_mtime:
            state_mtime = modified
            with open(STATE_PATH, 'r', encoding='utf-8') as stream:
                rebuild(json.load(stream))
    except (OSError, ValueError, json.JSONDecodeError):
        pass
    return True

def finish_collapse():
    global drawer_kind
    if not expanded:
        drawer_kind = None
        drawer.hide()
        panel.hide()
        window.set_size_request(20, -1)
        window.resize(20, screen_height)

def fade_to(target):
    global fade_tick
    if fade_tick is not None:
        panel.remove_tick_callback(fade_tick)
        fade_tick = None
    start_opacity = panel.get_opacity()
    if start_opacity == target:
        if target == 0:
            finish_collapse()
        return
    started = GLib.get_monotonic_time()
    def tick(_widget, _clock):
        global fade_tick
        progress = min(1.0, (GLib.get_monotonic_time() - started) / 150000)
        eased = progress * (2 - progress)
        opacity = start_opacity + (target - start_opacity) * eased
        panel.set_opacity(opacity)
        drawer.set_opacity(opacity)
        if progress < 1:
            return True
        fade_tick = None
        if target == 0:
            finish_collapse()
        return False
    fade_tick = panel.add_tick_callback(tick)

def expand(*_args):
    global collapse_timer, expanded
    if collapse_timer:
        GLib.source_remove(collapse_timer)
        collapse_timer = None
    if expanded:
        return False
    expanded = True
    panel.show_all()
    update_window_width()
    fade_to(1.0)
    return False

def collapse():
    global collapse_timer, expanded
    collapse_timer = None
    expanded = False
    fade_to(0.0)
    return False

def leave(*args):
    global collapse_timer
    if len(args) > 1 and args[1].detail == Gdk.NotifyType.INFERIOR:
        return False
    if collapse_timer:
        GLib.source_remove(collapse_timer)
    collapse_timer = GLib.timeout_add(800, collapse)
    return False

hotspot.add_events(Gdk.EventMask.ENTER_NOTIFY_MASK | Gdk.EventMask.LEAVE_NOTIFY_MASK | Gdk.EventMask.POINTER_MOTION_MASK | Gdk.EventMask.BUTTON_PRESS_MASK)
hotspot.connect('enter-notify-event', expand)
hotspot.connect('leave-notify-event', leave)
hotspot.connect('motion-notify-event', expand)
hotspot.connect('button-press-event', expand)
signal.signal(signal.SIGUSR1, lambda *_args: GLib.idle_add(expand))
signal.signal(signal.SIGUSR2, lambda *_args: GLib.idle_add(collapse))
signal.signal(signal.SIGTERM, lambda *_args: GLib.idle_add(Gtk.main_quit))
window.set_size_request(20, -1)
GLib.timeout_add(350, refresh_state)
refresh_state()
window.show_all()
volume_osd.set_opacity(0.0)
volume_window.hide()
panel.set_opacity(0)
drawer.set_opacity(0)
collapse()
Gtk.main()
