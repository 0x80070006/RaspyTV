#!/usr/bin/env python3
"""Surfaces RaspyTV affichées au-dessus de tout, y compris d'un jeu Moonlight.

- la barre latérale, qui se déploie au survol du bord gauche ou avec Share ;
- l'indicateur de volume, en haut à droite ;
- le panneau de la manette (PS maintenu) : lecture en cours, son, sortie audio, manette.

RaspyTV écrit l'état dans deux fichiers JSON (barre, panneau) et commande ce processus
par un socket. Ce processus renvoie les actions de l'utilisateur sur le socket de RaspyTV.
"""
import ctypes
import glob
import json
import os
import signal
import socket
import subprocess
import sys
import threading
import time

parent_pid = os.getppid()
ctypes.CDLL(None).prctl(1, signal.SIGTERM, 0, 0, 0)
if parent_pid == 1 or os.getppid() != parent_pid:
    sys.exit(0)

import gi
gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
gi.require_version('GdkPixbuf', '2.0')
gi.require_version('GtkLayerShell', '0.1')
gi.require_version('Pango', '1.0')
from gi.repository import Gdk, GdkPixbuf, GLib, Gtk, GtkLayerShell, Pango

SOCKET_PATH, STATE_PATH = sys.argv[1:3]
LAYER_SOCKET = sys.argv[3] if len(sys.argv) > 3 else None
PANEL_STATE_PATH = sys.argv[4] if len(sys.argv) > 4 else None
RUNTIME = os.environ.get('XDG_RUNTIME_DIR') or f'/run/user/{os.getuid()}'
# Présent tant que le panneau est ouvert : le service manette en déduit qu'il doit lui envoyer ses touches.
PANEL_FLAG = os.path.join(RUNTIME, 'raspytv-panel.open')
APP_DIR = os.path.dirname(os.path.abspath(__file__))

PEEK_MS = 4000
# Survol à la souris : repli après ce délai sans mouvement, même si le pointeur reste sur le bord.
HOVER_IDLE_MS = 6000
PANEL_IDLE_SECONDS = 60
VOLUME_SEGMENTS = 20
PANEL_VOLUME_SEGMENTS = 24
ART_SIZE = 168

CSS = '''
* { font-family: "DM Sans", "Cantarell", sans-serif; }
window, .hotspot, .shell { background: transparent; }

/* Barre latérale */
.rail { background: rgba(12, 15, 24, 0.95); border: 1px solid rgba(255, 255, 255, 0.07); border-left: 0;
        border-radius: 0 26px 26px 0; padding: 14px 11px; }
.rail-item { min-width: 74px; min-height: 62px; padding: 6px 0; border: 0; border-radius: 16px;
             background: transparent; color: #aab2c5; box-shadow: none; }
.rail-item:hover { background: rgba(255, 255, 255, 0.07); color: #ffffff; }
.rail-item.active { background: rgba(139, 123, 255, 0.17); color: #ffffff; box-shadow: inset 3px 0 0 #8b7bff; }
.rail-item:focus { background: rgba(139, 123, 255, 0.30); color: #ffffff; box-shadow: inset 0 0 0 2px #ffffff; }
.rail-item label { font-size: 11px; font-weight: 600; }
.rail-volume { min-width: 32px; min-height: 40px; padding: 4px; border: 0; border-radius: 12px;
               background: rgba(255, 255, 255, 0.05); color: #d7dceb; box-shadow: none; }
.rail-volume:hover { background: rgba(255, 255, 255, 0.11); }
.rail-volume:focus { box-shadow: inset 0 0 0 2px #ffffff; background: rgba(139, 123, 255, 0.30); }
.rail-separator { min-height: 1px; background: rgba(255, 255, 255, 0.08); margin: 6px 10px; }
.drawer { min-width: 250px; background: rgba(15, 18, 28, 0.97); border: 1px solid rgba(255, 255, 255, 0.07);
          border-left: 0; border-radius: 0 22px 22px 0; padding: 14px 12px; }
.drawer-title { color: #8e97ab; font-size: 11px; font-weight: 700; letter-spacing: 1px; padding: 2px 8px 10px; }
.drawer-item { min-height: 48px; padding: 6px 10px; border: 0; border-radius: 13px; background: transparent;
               color: #e8ecf6; box-shadow: none; }
.drawer-item:hover { background: rgba(255, 255, 255, 0.07); }
.drawer-item.active { background: rgba(139, 123, 255, 0.17); }
.drawer-item:focus { background: rgba(139, 123, 255, 0.30); box-shadow: inset 0 0 0 2px #ffffff; }
.drawer-item label { font-size: 14px; font-weight: 600; }
.drawer-empty { color: #8e97ab; padding: 6px 8px; }

/* Indicateur de volume */
.osd { padding: 12px 16px; border-radius: 16px; background: rgba(10, 12, 20, 0.93);
       border: 1px solid rgba(255, 255, 255, 0.09); color: #f3f5fb; }
.osd-value { font-size: 15px; font-weight: 700; min-width: 50px; }
.seg { min-width: 7px; min-height: 16px; border-radius: 2px; background: rgba(255, 255, 255, 0.14); }
.seg.on { background: #8b7bff; }
.osd.muted .seg.on { background: rgba(255, 255, 255, 0.35); }

/* Panneau de la manette */
.panel { padding: 22px; }
.card { background: rgba(12, 15, 24, 0.97); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 26px;
        padding: 24px 26px; color: #eef1f8; }
.card-title { color: #8e97ab; font-size: 12px; font-weight: 700; letter-spacing: 1.2px; }
.card-meta { color: #8e97ab; font-size: 13px; }
.media-title { font-size: 24px; font-weight: 700; }
.media-artist { color: #b6bdcc; font-size: 16px; }
.media-empty { color: #8e97ab; font-size: 16px; }
.art { border-radius: 14px; background: rgba(255, 255, 255, 0.06); }
.time { color: #8e97ab; font-size: 13px; min-width: 46px; }
scale trough { min-height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.14); }
scale highlight { border-radius: 3px; background: #8b7bff; }
scale slider { min-width: 16px; min-height: 16px; border-radius: 8px; background: #ffffff; border: 0; }
scale:focus slider { box-shadow: 0 0 0 4px rgba(139, 123, 255, 0.55); }
.control { min-width: 54px; min-height: 54px; border-radius: 27px; border: 0; background: rgba(255, 255, 255, 0.07);
           color: #eef1f8; box-shadow: none; }
.control.main { min-width: 66px; min-height: 66px; border-radius: 33px; background: #ffffff; color: #0b0e17; }
.control:hover { background: rgba(255, 255, 255, 0.13); }
.control.main:hover { background: #e7e9f2; }
.control:focus { box-shadow: 0 0 0 3px #8b7bff; }
.section-title { color: #8e97ab; font-size: 12px; font-weight: 700; letter-spacing: 1.2px; margin-top: 4px; }
.volume-control { padding: 10px 12px; border-radius: 14px; }
.volume-control.focused { background: rgba(139, 123, 255, 0.16); box-shadow: inset 0 0 0 2px #ffffff; }
.volume-value { font-size: 16px; font-weight: 700; min-width: 54px; }
.output { min-height: 46px; padding: 6px 12px; border: 0; border-radius: 13px; background: rgba(255, 255, 255, 0.04);
          color: #e8ecf6; box-shadow: none; }
.output:hover { background: rgba(255, 255, 255, 0.09); }
.output:focus { box-shadow: inset 0 0 0 2px #ffffff; background: rgba(139, 123, 255, 0.22); }
.output.active { background: rgba(139, 123, 255, 0.17); }
.output-state { color: #8e97ab; font-size: 12px; font-weight: 600; }
.output.active .output-state { color: #b9adff; }
.battery-value { font-size: 44px; font-weight: 700; }
.battery-none { font-size: 22px; font-weight: 700; }
.battery-status { color: #b6bdcc; font-size: 15px; }
progressbar trough { min-height: 12px; border-radius: 6px; background: rgba(255, 255, 255, 0.12); }
progressbar progress { min-height: 12px; border-radius: 6px; background: #2fd16b; }
.battery-low progressbar progress { background: #ff6b5b; }
.action { min-height: 48px; border: 0; border-radius: 14px; background: rgba(255, 255, 255, 0.07); color: #eef1f8;
          box-shadow: none; padding: 0 16px; }
.action:hover { background: rgba(255, 255, 255, 0.13); }
.action:focus { box-shadow: inset 0 0 0 2px #ffffff; background: rgba(139, 123, 255, 0.22); }
.hint { color: #6f788c; font-size: 12px; }
.dim { background-color: rgba(0, 0, 0, 0.5); }
.power-box { padding: 12px; border-radius: 16px; background: rgba(255, 255, 255, 0.04); }
.power-question { color: #d7dceb; font-size: 14px; font-weight: 600; }
.action.danger { color: #ffb4a8; }
.action.danger:focus { background: rgba(255, 107, 91, 0.22); }
'''


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
    # Un choix fait à la manette dans la barre la referme, sauf le volume qu'on règle en plusieurs appuis.
    if sidebar.peeking and command.get('action') not in ('volume', 'nav-peek', 'tv-panel-state'):
        GLib.idle_add(sidebar.end_peek)


def icon(name, size=22):
    image = Gtk.Image.new_from_icon_name(name, Gtk.IconSize.LARGE_TOOLBAR)
    image.set_pixel_size(size)
    return image


def file_icon(path, fallback, size):
    if path and os.path.isfile(path):
        try:
            return Gtk.Image.new_from_pixbuf(GdkPixbuf.Pixbuf.new_from_file_at_scale(path, size, size, True))
        except GLib.Error:
            pass
    return icon(fallback, size)


def styled(widget, *classes):
    context = widget.get_style_context()
    for name in classes:
        context.add_class(name)
    return widget


def label(text, *classes, xalign=0.0):
    widget = Gtk.Label(label=text)
    widget.set_xalign(xalign)
    return styled(widget, *classes)


def clear(box):
    for child in box.get_children():
        box.remove(child)


def focused_index(box):
    for index, child in enumerate(box.get_children()):
        if child.has_focus() or (isinstance(child, Gtk.Container) and child.get_focus_child()):
            return index
    return None


def focus_child(box, index=0):
    children = box.get_children()
    for child in children[index:] + children[:index]:
        if child.get_can_focus() and child.get_visible():
            child.grab_focus()
            return True
    return False


def layer_window(keyboard=False):
    window = Gtk.Window(type=Gtk.WindowType.TOPLEVEL)
    window.set_decorated(False)
    window.set_resizable(False)
    window.set_accept_focus(keyboard)
    window.set_focus_on_map(False)
    visual = window.get_screen().get_rgba_visual()
    if visual:
        window.set_visual(visual)
    window.set_app_paintable(True)
    GtkLayerShell.init_for_window(window)
    GtkLayerShell.set_layer(window, GtkLayerShell.Layer.OVERLAY)
    GtkLayerShell.set_exclusive_zone(window, 0)
    GtkLayerShell.set_keyboard_mode(window, GtkLayerShell.KeyboardMode.NONE)
    return window


def segment_bar(count):
    bar = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=3)
    bar.set_valign(Gtk.Align.CENTER)
    segments = [styled(Gtk.Box(), 'seg') for _ in range(count)]
    for segment in segments:
        bar.pack_start(segment, False, False, 0)
    return bar, segments


def paint_segments(segments, value):
    lit = round(max(0, min(100, value)) / 100 * len(segments))
    for index, segment in enumerate(segments):
        context = segment.get_style_context()
        if index < lit:
            context.add_class('on')
        else:
            context.remove_class('on')


def volume_icon_name(value, muted):
    if muted or value <= 0:
        return 'audio-volume-muted-symbolic'
    return 'audio-volume-low-symbolic' if value < 34 else 'audio-volume-medium-symbolic' if value < 67 else 'audio-volume-high-symbolic'


def read_json(path):
    try:
        with open(path, 'r', encoding='utf-8') as stream:
            return json.load(stream)
    except (OSError, ValueError):
        return None


def fade(widget, window, target, on_done=None, hide=True, state={}):
    """Fondu d'opacité ; une seule animation par widget à la fois. hide=False garde la fenêtre affichée."""
    key = id(widget)
    if state.get(key):
        widget.remove_tick_callback(state.pop(key))
    if target > 0 and not window.get_visible():
        widget.set_opacity(0.0)
        window.show_all()
    start, started = widget.get_opacity(), GLib.get_monotonic_time()
    duration = 140000 if target > start else 200000

    def tick(_widget, _clock):
        progress = min(1.0, (GLib.get_monotonic_time() - started) / duration)
        widget.set_opacity(start + (target - start) * (1 - (1 - progress) ** 2))
        if progress < 1:
            return True
        state.pop(key, None)
        if target == 0 and hide:
            window.hide()
        if on_done:
            on_done()
        return False

    state[key] = widget.add_tick_callback(tick)


# ---------------------------------------------------------------- indicateur de volume

class VolumeOsd:
    """Petit indicateur discret, en haut à droite : icône, barre segmentée, pourcentage."""

    def __init__(self):
        self.window = layer_window()
        # En bas à droite : en haut à droite, il masquerait l'horloge de l'accueil.
        GtkLayerShell.set_anchor(self.window, GtkLayerShell.Edge.BOTTOM, True)
        GtkLayerShell.set_anchor(self.window, GtkLayerShell.Edge.RIGHT, True)
        GtkLayerShell.set_margin(self.window, GtkLayerShell.Edge.BOTTOM, 36)
        GtkLayerShell.set_margin(self.window, GtkLayerShell.Edge.RIGHT, 36)
        self.box = styled(Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12), 'osd')
        self.icon = icon('audio-volume-high-symbolic', 20)
        self.bar, self.segments = segment_bar(VOLUME_SEGMENTS)
        self.value = label('0 %', 'osd-value', xalign=1.0)
        self.box.pack_start(self.icon, False, False, 0)
        self.box.pack_start(self.bar, False, False, 0)
        self.box.pack_start(self.value, False, False, 0)
        self.window.add(self.box)
        self.timer = None

    def show(self, value, muted=False):
        if panel.is_open:
            return  # Le panneau affiche déjà le volume.
        value = max(0, min(100, int(value)))
        self.icon.set_from_icon_name(volume_icon_name(value, muted), Gtk.IconSize.LARGE_TOOLBAR)
        self.icon.set_pixel_size(20)
        self.value.set_text('Muet' if muted else f'{value} %')
        paint_segments(self.segments, value)
        context = self.box.get_style_context()
        context.add_class('muted') if muted else context.remove_class('muted')
        fade(self.box, self.window, 1.0)
        if self.timer:
            GLib.source_remove(self.timer)
        self.timer = GLib.timeout_add(1600, self.hide)

    def hide(self):
        self.timer = None
        fade(self.box, self.window, 0.0)
        return False


# ---------------------------------------------------------------- barre latérale

class Sidebar:
    def __init__(self):
        self.window = layer_window()
        for edge in (GtkLayerShell.Edge.LEFT, GtkLayerShell.Edge.TOP, GtkLayerShell.Edge.BOTTOM):
            GtkLayerShell.set_anchor(self.window, edge, True)
        display = Gdk.Display.get_default()
        monitor = (display.get_primary_monitor() or display.get_monitor(0)) if display else None
        self.screen_height = monitor.get_geometry().height if monitor else 1080
        self.hotspot = styled(Gtk.EventBox(), 'hotspot')
        self.hotspot.set_visible_window(True)
        self.hotspot.set_size_request(20, self.screen_height)
        shell = styled(Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=0), 'shell')
        self.rail = styled(Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6), 'rail')
        self.rail.set_valign(Gtk.Align.CENTER)
        self.drawer = styled(Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4), 'drawer')
        self.drawer.set_valign(Gtk.Align.CENTER)
        shell.pack_start(self.rail, False, False, 0)
        shell.pack_start(self.drawer, False, False, 0)
        self.hotspot.add(shell)
        self.window.add(self.hotspot)
        self.data = {}
        self.expanded = False
        self.peeking = False
        self.drawer_kind = None
        self.collapse_timer = None
        self.last_volume = None
        self.last_muted = None
        self.hotspot.add_events(Gdk.EventMask.ENTER_NOTIFY_MASK | Gdk.EventMask.LEAVE_NOTIFY_MASK
                                | Gdk.EventMask.POINTER_MOTION_MASK | Gdk.EventMask.BUTTON_PRESS_MASK)
        self.hotspot.connect('enter-notify-event', self.hover)
        self.hotspot.connect('leave-notify-event', self.leave)
        self.hotspot.connect('motion-notify-event', self.hover)
        self.hotspot.connect('button-press-event', self.hover)
        self.window.connect('key-press-event', self.on_key_press)

    # --- construction

    def item(self, icon_name, text, command=None, active=False, callback=None):
        button = styled(Gtk.Button(), 'rail-item')
        button.set_relief(Gtk.ReliefStyle.NONE)
        button.set_tooltip_text(text)
        if active:
            styled(button, 'active')
        button.set_halign(Gtk.Align.CENTER)
        content = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
        content.set_halign(Gtk.Align.CENTER)
        content.set_valign(Gtk.Align.CENTER)
        image = icon(icon_name, 22)
        image.set_halign(Gtk.Align.CENTER)
        caption = label(text, xalign=0.5)
        caption.set_halign(Gtk.Align.CENTER)
        caption.set_justify(Gtk.Justification.CENTER)
        content.pack_start(image, False, False, 0)
        content.pack_start(caption, False, False, 0)
        button.add(content)
        button.connect('clicked', callback if callback else lambda _button: send(command))
        self.rail.pack_start(button, False, False, 0)
        return button

    def volume_row(self):
        row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        row.set_halign(Gtk.Align.CENTER)
        for icon_name, delta, tooltip in (('audio-volume-low-symbolic', -5, 'Baisser le volume'),
                                          ('audio-volume-high-symbolic', 5, 'Augmenter le volume')):
            button = styled(Gtk.Button(), 'rail-volume')
            button.set_relief(Gtk.ReliefStyle.NONE)
            button.set_tooltip_text(tooltip)
            glyph = icon(icon_name, 18)
            glyph.set_halign(Gtk.Align.CENTER)
            glyph.set_valign(Gtk.Align.CENTER)
            button.add(glyph)
            button.connect('clicked', lambda _button, step=delta: self.volume_click(step))
            row.pack_start(button, False, False, 0)
        self.rail.pack_start(row, False, False, 0)

    def separator(self):
        self.rail.pack_start(styled(Gtk.Box(), 'rail-separator'), False, False, 0)

    def build_drawer(self):
        clear(self.drawer)
        if not self.drawer_kind:
            self.drawer.hide()
            self.update_width()
            return
        native = self.drawer_kind == 'native'
        self.drawer.pack_start(label('APPLICATIONS' if native else 'RACCOURCIS', 'drawer-title'), False, False, 0)
        apps = [app for app in self.data.get('apps', []) if bool(app.get('native')) == native]
        active_id = None if self.data.get('nativeMode') else self.data.get('activeId')
        for app in apps:
            button = styled(Gtk.Button(), 'drawer-item')
            button.set_relief(Gtk.ReliefStyle.NONE)
            if app.get('id') == active_id:
                styled(button, 'active')
            content = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
            content.pack_start(file_icon(app.get('icon', ''), 'application-x-executable-symbolic', 30), False, False, 0)
            content.pack_start(label(app.get('name', 'Application')), True, True, 0)
            button.add(content)
            button.connect('clicked', lambda _button, app_id=app.get('id'): send({'action': 'launch', 'id': app_id}))
            self.drawer.pack_start(button, False, False, 0)
        if not apps:
            self.drawer.pack_start(label('Aucune application', 'drawer-empty'), False, False, 0)
        self.drawer.show_all()
        self.update_width()

    def toggle_drawer(self, kind):
        self.drawer_kind = None if self.drawer_kind == kind else kind
        self.build_drawer()
        if self.peeking:
            self.restart_peek_timer()
            if self.drawer_kind:
                focus_child(self.drawer, 1)

    def rebuild(self, data):
        self.data = data
        rail_focus, drawer_focus = focused_index(self.rail), focused_index(self.drawer)
        clear(self.rail)
        active = data.get('activeId') if not data.get('nativeMode') else None
        apps = data.get('apps', [])
        native_active = any(app.get('native') and app.get('id') == active for app in apps)
        custom_active = any(not app.get('native') and app.get('id') == active for app in apps)
        self.item('go-home-symbolic', 'Accueil', {'action': 'home'}, not active and not data.get('nativeMode'))
        self.item('view-app-grid-symbolic', 'Apps', active=native_active or self.drawer_kind == 'native', callback=lambda _b: self.toggle_drawer('native'))
        self.item('starred-symbolic', 'Raccourcis', active=custom_active or self.drawer_kind == 'custom', callback=lambda _b: self.toggle_drawer('custom'))
        self.item('input-gaming-symbolic', 'Jeux', {'action': 'moonlight'}, data.get('nativeMode', False))
        if data.get('nativeMode'):
            self.item('input-keyboard-symbolic', 'Clavier', {'action': 'keyboard'})
        self.separator()
        self.volume_row()
        self.separator()
        self.item('preferences-system-symbolic', 'Réglages', {'action': 'settings'})
        self.build_drawer()
        if data.get('artMode'):
            self.window.hide()
            return
        self.window.show_all()
        if not self.drawer_kind:
            self.drawer.hide()
        if self.peeking:
            if drawer_focus is not None and self.drawer_kind:
                focus_child(self.drawer, drawer_focus)
            elif rail_focus is not None:
                focus_child(self.rail, rail_focus)
        volume, muted = data.get('systemVolume'), bool(data.get('systemMuted'))
        if isinstance(volume, (int, float)) and isinstance(self.last_volume, (int, float)) and (int(volume) != int(self.last_volume) or muted != self.last_muted):
            osd.show(volume, muted)
        if isinstance(volume, (int, float)):
            self.last_volume, self.last_muted = volume, muted
        if not self.expanded:
            self.finish_collapse()

    def volume_click(self, delta):
        base = self.data.get('systemVolume')
        if isinstance(base, (int, float)):
            osd.show(base + delta)
        send({'action': 'volume', 'delta': delta})

    # --- déploiement

    def update_width(self):
        if self.expanded:
            width = (96 + 262) if self.drawer_kind else 96
            self.window.set_size_request(width, -1)
            self.window.resize(width, self.screen_height)

    def finish_collapse(self):
        if not self.expanded:
            self.drawer_kind = None
            self.drawer.hide()
            self.rail.hide()
            self.window.set_size_request(20, -1)
            self.window.resize(20, self.screen_height)

    def expand(self, *_args):
        if self.collapse_timer:
            GLib.source_remove(self.collapse_timer)
            self.collapse_timer = None
        if self.expanded:
            return False
        self.expanded = True
        self.rail.show_all()
        self.update_width()
        fade(self.rail, self.window, 1.0)
        self.drawer.set_opacity(1.0)
        return False

    def collapse(self):
        self.collapse_timer = None
        self.release_keyboard()
        self.expanded = False
        fade(self.rail, self.window, 0.0, on_done=self.after_fade_out, hide=False)
        return False

    def after_fade_out(self):
        # La fenêtre reste visible : sa bande de 20 px sert à détecter le survol du bord.
        self.finish_collapse()

    def hover(self, *_args):
        self.expand()
        # Un pointeur immobile sur le bord ne garde pas la barre ouverte indéfiniment.
        self.collapse_timer = GLib.timeout_add(PEEK_MS if self.peeking else HOVER_IDLE_MS, self.collapse)
        return False

    def leave(self, *args):
        if len(args) > 1 and args[1].detail == Gdk.NotifyType.INFERIOR:
            return False
        if self.collapse_timer:
            GLib.source_remove(self.collapse_timer)
        self.collapse_timer = GLib.timeout_add(800, self.collapse)
        return False

    # --- pilotage à la manette (Share)

    def restart_peek_timer(self):
        if self.collapse_timer:
            GLib.source_remove(self.collapse_timer)
        self.collapse_timer = GLib.timeout_add(PEEK_MS, self.collapse)

    def begin_peek(self):
        self.peeking = True
        self.window.set_accept_focus(True)
        GtkLayerShell.set_keyboard_mode(self.window, GtkLayerShell.KeyboardMode.EXCLUSIVE)
        self.expand()
        self.restart_peek_timer()
        GLib.idle_add(lambda: focus_child(self.rail) and False)
        send({'action': 'nav-peek', 'open': True})

    def release_keyboard(self):
        if not self.peeking:
            return
        self.peeking = False
        GtkLayerShell.set_keyboard_mode(self.window, GtkLayerShell.KeyboardMode.NONE)
        self.window.set_accept_focus(False)
        send({'action': 'nav-peek', 'open': False})

    def end_peek(self, *_args):
        if self.collapse_timer:
            GLib.source_remove(self.collapse_timer)
            self.collapse_timer = None
        self.collapse()
        return False

    def toggle_peek(self, *_args):
        if self.peeking:
            self.end_peek()
        elif not panel.is_open:
            self.begin_peek()
        return True

    def on_key_press(self, _widget, event):
        if not self.peeking:
            return False
        if event.keyval == Gdk.KEY_Escape:
            self.end_peek()
            return True
        self.restart_peek_timer()
        return False


# ---------------------------------------------------------------- panneau de la manette

def format_time(seconds):
    seconds = max(0, int(seconds))
    hours, minutes, rest = seconds // 3600, seconds // 60 % 60, seconds % 60
    return f'{hours}:{minutes:02d}:{rest:02d}' if hours else f'{minutes}:{rest:02d}'


def controller_battery():
    for path in sorted(glob.glob('/sys/class/power_supply/ps-controller-battery-*') + glob.glob('/sys/class/power_supply/sony_controller_battery_*')):
        try:
            capacity = int(open(os.path.join(path, 'capacity')).read().strip())
            status = open(os.path.join(path, 'status')).read().strip()
        except (OSError, ValueError):
            continue
        address = os.path.basename(path).split('battery-')[-1].split('battery_')[-1].upper()
        return max(0, min(100, capacity)), status, address
    return None, '', ''


STATUS_LABELS = {'Charging': 'En charge', 'Discharging': 'Sur batterie', 'Full': 'Chargée', 'Not charging': 'Branchée'}


class VolumeControl(Gtk.EventBox):
    """Barre de son segmentée : ‹ › pour régler, ↑ ↓ pour passer à l'élément voisin."""

    def __init__(self, on_change):
        super().__init__()
        self.on_change = on_change
        self.value = 0
        self.set_can_focus(True)
        self.set_visible_window(False)
        box = styled(Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12), 'volume-control')
        self.icon = icon('audio-volume-high-symbolic', 22)
        self.bar, self.segments = segment_bar(PANEL_VOLUME_SEGMENTS)
        self.label = label('0 %', 'volume-value', xalign=1.0)
        box.pack_start(self.icon, False, False, 0)
        box.pack_start(self.bar, True, True, 0)
        box.pack_start(self.label, False, False, 0)
        self.box = box
        self.add(box)
        self.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.KEY_PRESS_MASK)
        self.connect('key-press-event', self.on_key)
        self.connect('button-press-event', self.on_click)
        self.connect('focus-in-event', lambda *_a: styled(self.box, 'focused') and False)
        self.connect('focus-out-event', lambda *_a: self.box.get_style_context().remove_class('focused') or False)

    def set_value(self, value, muted=False):
        self.value = max(0, min(100, int(value)))
        self.label.set_text('Muet' if muted else f'{self.value} %')
        self.icon.set_from_icon_name(volume_icon_name(self.value, muted), Gtk.IconSize.LARGE_TOOLBAR)
        self.icon.set_pixel_size(22)
        paint_segments(self.segments, self.value)

    def change(self, value):
        self.set_value(value)
        self.on_change(self.value)

    def on_key(self, _widget, event):
        if event.keyval in (Gdk.KEY_Left, Gdk.KEY_minus, Gdk.KEY_KP_Subtract):
            self.change(self.value - 2)
            return True
        if event.keyval in (Gdk.KEY_Right, Gdk.KEY_plus, Gdk.KEY_KP_Add):
            self.change(self.value + 2)
            return True
        return move_vertically(self, event)

    def on_click(self, _widget, event):
        self.grab_focus()
        allocation = self.bar.get_allocation()
        x, _y = self.translate_coordinates(self.bar, event.x, event.y)
        if allocation.width > 0:
            self.change(round(x / allocation.width * 100))
        return True


def move_vertically(widget, event):
    """Haut/Bas quittent un réglage horizontal, au lieu de modifier sa valeur."""
    direction = {Gdk.KEY_Up: Gtk.DirectionType.UP, Gdk.KEY_Down: Gtk.DirectionType.DOWN}.get(event.keyval)
    if direction is None:
        return False
    widget.get_toplevel().child_focus(direction)
    return True


class Dim:
    """Voile noir à 50 % derrière le panneau : il assombrit tout l'écran, jeu compris."""

    def __init__(self, on_click):
        self.window = layer_window()
        for edge in (GtkLayerShell.Edge.TOP, GtkLayerShell.Edge.BOTTOM, GtkLayerShell.Edge.LEFT, GtkLayerShell.Edge.RIGHT):
            GtkLayerShell.set_anchor(self.window, edge, True)
        GtkLayerShell.set_exclusive_zone(self.window, -1)  # Couvre aussi les zones réservées par d'autres surfaces.
        events = Gtk.EventBox()
        events.set_visible_window(False)
        events.connect('button-press-event', lambda *_args: on_click() or True)
        self.box = styled(Gtk.Box(), 'dim')
        self.box.set_hexpand(True)
        self.box.set_vexpand(True)
        events.add(self.box)
        self.window.add(events)


class Panel:
    def __init__(self):
        # Le voile est créé et affiché avant le panneau : à ordre égal, la dernière surface passe devant.
        self.dim = Dim(self.close)
        self.window = layer_window(keyboard=True)
        self.is_open = False
        self.state = {}
        self.art_path = None
        self.outputs_signature = None
        self.seek_hold_until = 0.0
        self.volume_hold_until = 0.0
        self.seek_timer = None
        self.volume_timer = None
        self.tick_timer = None
        self.last_input = 0.0
        self.position = 0.0
        self.controller_address = ''
        self.controller_bluetooth = False
        # Tant que l'utilisateur n'a rien touché, le focus peut encore passer sur Lecture/Pause.
        self.untouched = False
        self.power_asking = False

        outer = styled(Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=20), 'panel')
        self.media_card = self.build_media_card()
        self.controller_card = self.build_controller_card()
        outer.pack_start(self.media_card, False, False, 0)
        outer.pack_start(self.controller_card, False, False, 0)
        self.outer = outer
        self.window.add(outer)
        self.window.connect('key-press-event', self.on_key_press)

    # --- carte « lecture en cours » et son

    def build_media_card(self):
        card = styled(Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14), 'card')
        card.set_size_request(660, -1)
        header = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL)
        header.pack_start(label('LECTURE EN COURS', 'card-title'), True, True, 0)
        self.media_app = label('', 'card-meta', xalign=1.0)
        header.pack_start(self.media_app, False, False, 0)
        card.pack_start(header, False, False, 0)

        self.media_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14)
        row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=20)
        self.art = styled(Gtk.Image(), 'art')
        self.art.set_size_request(ART_SIZE, ART_SIZE)
        row.pack_start(self.art, False, False, 0)
        text = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        text.set_valign(Gtk.Align.CENTER)
        self.title = label('', 'media-title')
        self.title.set_line_wrap(True)
        self.title.set_lines(2)
        self.title.set_ellipsize(Pango.EllipsizeMode.END)
        self.title.set_max_width_chars(28)
        self.artist = label('', 'media-artist')
        self.artist.set_ellipsize(Pango.EllipsizeMode.END)
        self.artist.set_max_width_chars(36)
        text.pack_start(self.title, False, False, 0)
        text.pack_start(self.artist, False, False, 0)
        row.pack_start(text, True, True, 0)
        self.media_box.pack_start(row, False, False, 0)

        progress = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
        self.elapsed = label('0:00', 'time')
        self.scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 1, 1)
        self.scale.set_draw_value(False)
        self.scale.set_increments(5, 15)
        self.scale.connect('change-value', self.on_seek)
        self.scale.connect('key-press-event', lambda widget, event: move_vertically(widget, event))
        self.duration = label('0:00', 'time', xalign=1.0)
        progress.pack_start(self.elapsed, False, False, 0)
        progress.pack_start(self.scale, True, True, 0)
        progress.pack_start(self.duration, False, False, 0)
        self.media_box.pack_start(progress, False, False, 0)

        controls = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=18)
        controls.set_halign(Gtk.Align.CENTER)
        self.previous_button = self.control('media-skip-backward-symbolic', 'Précédent', lambda _b: self.media('previous'))
        self.play_button = self.control('media-playback-start-symbolic', 'Lecture / pause', lambda _b: self.media('toggle'), main=True)
        self.next_button = self.control('media-skip-forward-symbolic', 'Suivant', lambda _b: self.media('next'))
        for button in (self.previous_button, self.play_button, self.next_button):
            controls.pack_start(button, False, False, 0)
        self.media_box.pack_start(controls, False, False, 0)
        card.pack_start(self.media_box, False, False, 0)
        self.media_empty = label('Rien ne joue pour l’instant.\nLance une musique dans NouTube Music : elle continuera\nen arrière-plan pendant que tu navigues.', 'media-empty')
        card.pack_start(self.media_empty, False, False, 0)

        card.pack_start(label('SON', 'section-title'), False, False, 0)
        self.volume = VolumeControl(self.on_volume)
        card.pack_start(self.volume, False, False, 0)
        card.pack_start(label('SORTIE AUDIO', 'section-title'), False, False, 0)
        self.outputs = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        card.pack_start(self.outputs, False, False, 0)
        return card

    def control(self, icon_name, tooltip, callback, main=False):
        button = styled(Gtk.Button(), 'control', *(['main'] if main else []))
        button.set_relief(Gtk.ReliefStyle.NONE)
        button.set_tooltip_text(tooltip)
        button.add(icon(icon_name, 28 if main else 22))
        button.connect('clicked', callback)
        return button

    # --- carte « manette »

    def build_controller_card(self):
        card = styled(Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14), 'card')
        card.set_size_request(380, -1)
        header = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL)
        header.pack_start(label('MANETTE', 'card-title'), True, True, 0)
        self.connection = label('', 'card-meta', xalign=1.0)
        header.pack_start(self.connection, False, False, 0)
        card.pack_start(header, False, False, 0)
        self.battery_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        self.battery_value = label('—', 'battery-value')
        self.battery_status = label('', 'battery-status')
        self.battery_bar = Gtk.ProgressBar()
        self.battery_box.pack_start(self.battery_value, False, False, 0)
        self.battery_box.pack_start(self.battery_status, False, False, 0)
        self.battery_box.pack_start(self.battery_bar, False, False, 6)
        card.pack_start(self.battery_box, False, False, 0)
        self.off_button = styled(Gtk.Button(), 'action')
        self.off_button.set_relief(Gtk.ReliefStyle.NONE)
        content = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        content.pack_start(icon('input-gaming-symbolic', 18), False, False, 0)
        content.pack_start(label('Éteindre la manette'), False, False, 0)
        self.off_button.add(content)
        self.off_button.connect('clicked', self.power_off_controller)
        card.pack_start(self.off_button, False, False, 4)

        self.power_button = self.action_button('system-shutdown-symbolic', 'Alimentation', self.ask_power)
        card.pack_start(self.power_button, False, False, 0)
        self.power_box = styled(Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8), 'power-box')
        self.power_box.pack_start(label('Éteindre ou redémarrer le Raspberry Pi ?', 'power-question'), False, False, 2)
        self.power_box.pack_start(self.action_button('system-shutdown-symbolic', 'Éteindre le Raspberry Pi', lambda _b: self.system_power('poweroff'), danger=True), False, False, 0)
        self.power_box.pack_start(self.action_button('view-refresh-symbolic', 'Redémarrer', lambda _b: self.system_power('reboot'), danger=True), False, False, 0)
        self.power_cancel = self.action_button('window-close-symbolic', 'Annuler', self.cancel_power)
        self.power_box.pack_start(self.power_cancel, False, False, 0)
        card.pack_start(self.power_box, False, False, 0)
        spacer = Gtk.Box()
        card.pack_start(spacer, True, True, 0)
        card.pack_start(label('✕ valider   ○ ou PS fermer\n‹ › régler   ↑ ↓ naviguer', 'hint'), False, False, 0)
        return card

    def action_button(self, icon_name, text, callback, danger=False):
        button = styled(Gtk.Button(), 'action', *(['danger'] if danger else []))
        button.set_relief(Gtk.ReliefStyle.NONE)
        content = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        content.pack_start(icon(icon_name, 18), False, False, 0)
        content.pack_start(label(text), False, False, 0)
        button.add(content)
        button.connect('clicked', callback)
        return button

    # --- alimentation du Raspberry Pi : toujours une confirmation, Annuler par défaut

    def ask_power(self, _button):
        self.power_asking = True
        self.refresh_visibility()
        self.power_cancel.grab_focus()

    def cancel_power(self, _button):
        self.power_asking = False
        self.refresh_visibility()
        self.power_button.grab_focus()

    def system_power(self, op):
        self.power_asking = False
        self.close()
        send({'action': 'system-power', 'op': op})

    # --- ouverture et fermeture

    def toggle(self):
        self.close() if self.is_open else self.open()

    def open(self):
        if self.is_open:
            return
        if sidebar.peeking:
            sidebar.end_peek()
        osd.hide()
        self.is_open = True
        self.last_input = time.monotonic()
        self.untouched = True
        try:
            with open(PANEL_FLAG, 'w'):
                pass
        except OSError:
            pass
        threading.Thread(target=self.detect_connection, daemon=True).start()
        self.apply_state(read_json(PANEL_STATE_PATH) or {}) if PANEL_STATE_PATH else None
        self.power_asking = False
        fade(self.dim.box, self.dim.window, 1.0)
        self.outer.set_opacity(0.0)
        self.window.show_all()
        # Après show_all, qui réaffiche tout : ce qui doit rester caché est caché de nouveau ici.
        self.update_controller()
        self.refresh_visibility()
        GtkLayerShell.set_keyboard_mode(self.window, GtkLayerShell.KeyboardMode.EXCLUSIVE)
        self.window.present()
        fade(self.outer, self.window, 1.0)
        GLib.idle_add(self.initial_focus)
        self.tick_timer = GLib.timeout_add(250, self.tick)
        send({'action': 'tv-panel-state', 'open': True})

    def initial_focus(self):
        # Sans lecture, le focus part de la sortie audio active plutôt que du volume :
        # sur le volume, ‹ › règlent le son, ce qui empêchait d'atteindre la carte de droite.
        if self.media_box.get_visible():
            self.play_button.grab_focus()
        else:
            outputs = [child for child in self.outputs.get_children() if child.get_visible()]
            active = [child for child in outputs if child.get_style_context().has_class('active')]
            (active or outputs or [self.volume])[0].grab_focus()
        return False

    def switch_column(self, keyval):
        """‹ › passent d'une carte à l'autre, sauf sur le volume et la barre de lecture qu'elles règlent."""
        focus = self.window.get_focus()
        if focus is None or focus in (self.volume, self.scale):
            return False
        # D'abord le voisin sur la même ligne (précédent, lecture, suivant), puis l'autre carte.
        parent = focus.get_parent()
        direction = Gtk.DirectionType.RIGHT if keyval == Gdk.KEY_Right else Gtk.DirectionType.LEFT
        if parent is not None and parent.child_focus(direction):
            return True
        def inside(widget, card):
            return widget is card or widget.is_ancestor(card)
        if keyval == Gdk.KEY_Right and inside(focus, self.media_card):
            targets = [self.power_cancel] if self.power_asking else [self.off_button, self.power_button]
        elif keyval == Gdk.KEY_Left and inside(focus, self.controller_card):
            targets = [self.play_button] if self.media_box.get_visible() else []
            targets += [child for child in self.outputs.get_children() if child.get_style_context().has_class('active')]
            targets += self.outputs.get_children() + [self.volume]
        else:
            return False
        for target in targets:
            if target.get_visible() and target.get_sensitive() and target.get_mapped():
                target.grab_focus()
                return True
        return False

    def close(self):
        if not self.is_open:
            return
        self.is_open = False
        self.power_asking = False
        GtkLayerShell.set_keyboard_mode(self.window, GtkLayerShell.KeyboardMode.NONE)
        fade(self.outer, self.window, 0.0)
        fade(self.dim.box, self.dim.window, 0.0)
        if self.tick_timer:
            GLib.source_remove(self.tick_timer)
            self.tick_timer = None
        try:
            os.unlink(PANEL_FLAG)
        except OSError:
            pass
        send({'action': 'tv-panel-state', 'open': False})

    def on_key_press(self, _widget, event):
        self.last_input = time.monotonic()
        self.untouched = False
        if event.keyval == Gdk.KEY_Escape:
            self.close()
            return True
        if event.keyval in (Gdk.KEY_Left, Gdk.KEY_Right):
            return self.switch_column(event.keyval)
        return False

    def tick(self):
        if not self.is_open:
            return False
        if time.monotonic() - self.last_input > PANEL_IDLE_SECONDS:
            self.close()
            return False
        media = self.state.get('media') or {}
        # Entre deux mises à jour de RaspyTV, la position avance d'elle-même : la barre reste fluide.
        if media.get('playing') and time.monotonic() > self.seek_hold_until:
            self.position = min(self.position + 0.25, media.get('duration') or self.position + 0.25)
            self.show_position(self.position, media.get('duration') or 0)
        if int(time.monotonic() * 4) % 4 == 0:
            self.update_controller()
        return True

    # --- données

    def apply_state(self, state):
        self.state = state
        media = state.get('media')
        if media:
            self.media_app.set_text(media.get('app') or '')
            self.title.set_text(media.get('title') or 'Sans titre')
            self.artist.set_text(media.get('artist') or '')
            self.set_art(media.get('artwork') or '')
            playing = bool(media.get('playing'))
            self.play_button.get_child().set_from_icon_name('media-playback-pause-symbolic' if playing else 'media-playback-start-symbolic', Gtk.IconSize.LARGE_TOOLBAR)
            self.play_button.get_child().set_pixel_size(28)
            if time.monotonic() > self.seek_hold_until:
                self.position = float(media.get('position') or 0)
                self.show_position(self.position, float(media.get('duration') or 0))
        else:
            self.media_app.set_text('')
        audio = state.get('audio') or {}
        if time.monotonic() > self.volume_hold_until and isinstance(audio.get('volume'), (int, float)):
            self.volume.set_value(audio['volume'], bool(audio.get('muted')))
        self.build_outputs(audio.get('outputs') or [], audio.get('bluetooth') or [])
        had_media = self.media_box.get_visible()
        self.refresh_visibility()
        # La lecture en cours arrive souvent juste après l'ouverture : le focus la rejoint si rien n'a été touché.
        if media and not had_media and self.is_open and self.untouched:
            self.play_button.grab_focus()

    def refresh_visibility(self):
        has_media = bool(self.state.get('media'))
        self.media_box.set_visible(has_media)
        self.media_empty.set_visible(not has_media)
        self.off_button.set_visible(self.controller_bluetooth and bool(self.controller_address))
        self.power_box.set_visible(self.power_asking)
        self.power_button.set_visible(not self.power_asking)

    def show_position(self, position, duration):
        self.scale.set_range(0, max(1.0, duration))
        self.scale.set_value(min(position, max(1.0, duration)))
        self.elapsed.set_text(format_time(position))
        self.duration.set_text(format_time(duration) if duration else '—')

    def set_art(self, path):
        if path == self.art_path:
            return
        self.art_path = path
        try:
            pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(path, ART_SIZE, ART_SIZE, True) if path else None
        except GLib.Error:
            pixbuf = None
        if pixbuf:
            self.art.set_from_pixbuf(pixbuf)
        else:
            self.art.set_from_icon_name('audio-x-generic-symbolic', Gtk.IconSize.DIALOG)
            self.art.set_pixel_size(72)

    def build_outputs(self, outputs, bluetooth):
        signature = json.dumps([outputs, bluetooth], sort_keys=True)
        if signature == self.outputs_signature:
            return
        self.outputs_signature = signature
        focus = focused_index(self.outputs)
        clear(self.outputs)
        for output in outputs:
            name = output.get('name') or 'Sortie audio'
            kind = output.get('kind')
            icon_name = ('audio-headphones-symbolic' if output.get('headset') or kind == 'bluetooth'
                         else 'video-display-symbolic' if kind == 'hdmi' else 'audio-speakers-symbolic')
            self.output_button(icon_name, name, 'Active' if output.get('active') else '', output.get('id'), output.get('active'))
        for device in bluetooth:
            self.output_button('bluetooth-active-symbolic', device.get('name') or 'Appareil Bluetooth', 'Se connecter', device.get('id'), False)
        if not outputs and not bluetooth:
            self.outputs.pack_start(label('Aucune sortie audio détectée', 'card-meta'), False, False, 0)
        self.outputs.show_all()
        if focus is not None and self.is_open:
            focus_child(self.outputs, min(focus, len(self.outputs.get_children()) - 1))

    def output_button(self, icon_name, name, state_text, output_id, active):
        button = styled(Gtk.Button(), 'output', *(['active'] if active else []))
        button.set_relief(Gtk.ReliefStyle.NONE)
        content = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
        content.pack_start(icon(icon_name, 20), False, False, 0)
        name_label = label(name)
        name_label.set_ellipsize(Pango.EllipsizeMode.END)
        content.pack_start(name_label, True, True, 0)
        state = label(state_text, 'output-state', xalign=1.0)
        content.pack_start(state, False, False, 0)
        button.add(content)

        def choose(_button):
            if active:
                return
            state.set_text('Connexion…' if output_id.startswith('bt:') else 'Activation…')
            send({'action': 'audio-output', 'id': output_id})

        button.connect('clicked', choose)
        self.outputs.pack_start(button, False, False, 0)

    # --- actions

    def media(self, op):
        self.last_input = time.monotonic()
        send({'action': 'media', 'op': op})

    def on_seek(self, _scale, _scroll, value):
        self.last_input = time.monotonic()
        self.position = max(0.0, value)
        self.seek_hold_until = time.monotonic() + 1.6
        self.elapsed.set_text(format_time(self.position))
        if self.seek_timer:
            GLib.source_remove(self.seek_timer)
        self.seek_timer = GLib.timeout_add(350, self.send_seek)
        return False

    def send_seek(self):
        self.seek_timer = None
        send({'action': 'media', 'op': 'seek', 'value': round(self.position, 1)})
        return False

    def on_volume(self, value):
        self.last_input = time.monotonic()
        self.volume_hold_until = time.monotonic() + 1.2
        if self.volume_timer:
            GLib.source_remove(self.volume_timer)
        self.volume_timer = GLib.timeout_add(120, self.send_volume, value)

    def send_volume(self, value):
        self.volume_timer = None
        send({'action': 'volume-set', 'value': value})
        return False

    def update_controller(self):
        capacity, status, address = controller_battery()
        self.controller_address = address
        value_style = self.battery_value.get_style_context()
        if capacity is None:
            value_style.remove_class('battery-value')
            value_style.add_class('battery-none')
            self.battery_value.set_text('Aucune manette connectée')
            self.battery_status.set_text('Appuie sur PS pour l’allumer.')
            self.battery_bar.hide()
            self.connection.set_text('')
        else:
            value_style.remove_class('battery-none')
            value_style.add_class('battery-value')
            self.battery_bar.show()
            self.battery_value.set_text(f'{capacity} %')
            self.battery_status.set_text(STATUS_LABELS.get(status, status))
            self.battery_bar.set_fraction(capacity / 100)
            context = self.battery_box.get_style_context()
            context.add_class('battery-low') if capacity <= 15 and status != 'Charging' else context.remove_class('battery-low')
            self.connection.set_text('Bluetooth' if self.controller_bluetooth else 'USB' if address else '')
        self.refresh_visibility()

    def detect_connection(self):
        """bluetoothctl est lent : interrogé une fois à l'ouverture, hors de l'interface."""
        _capacity, _status, address = controller_battery()
        connected = False
        if address:
            try:
                info = subprocess.run(['bluetoothctl', 'info', address], capture_output=True, text=True, timeout=3).stdout
                connected = 'Connected: yes' in info
            except (OSError, subprocess.SubprocessError):
                pass
        GLib.idle_add(self.set_bluetooth, connected)

    def set_bluetooth(self, connected):
        self.controller_bluetooth = connected
        self.update_controller()
        return False

    def power_off_controller(self, _button):
        address = self.controller_address
        self.close()
        if address:
            threading.Thread(target=lambda: subprocess.run(['bluetoothctl', 'disconnect', address], capture_output=True, timeout=10), daemon=True).start()


# ---------------------------------------------------------------- état et commandes

state_mtimes = {}


def refresh_state():
    for path, handler in ((STATE_PATH, sidebar.rebuild), (PANEL_STATE_PATH, panel_state_changed)):
        if not path:
            continue
        try:
            modified = os.path.getmtime(path)
        except OSError:
            continue
        if state_mtimes.get(path) == modified:
            continue
        state_mtimes[path] = modified
        data = read_json(path)
        if isinstance(data, dict):
            handler(data)
    return True


def panel_state_changed(data):
    if panel.is_open:
        panel.apply_state(data)


def start_control_socket():
    """Canal de commande de RaspyTV vers ce processus (ouverture du panneau, notamment)."""
    if not LAYER_SOCKET:
        return None
    try:
        os.unlink(LAYER_SOCKET)
    except OSError:
        pass
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(LAYER_SOCKET)
    os.chmod(LAYER_SOCKET, 0o600)
    server.listen(4)
    server.setblocking(False)

    def accept(_fd, _condition):
        try:
            client, _ = server.accept()
        except OSError:
            return True
        with client:
            client.settimeout(0.3)
            data = b''
            try:
                while len(data) < 4096:
                    chunk = client.recv(1024)
                    if not chunk:
                        break
                    data += chunk
                command = json.loads(data.decode('utf-8'))
            except (OSError, ValueError):
                return True
        if isinstance(command, dict) and command.get('op') == 'panel':
            panel.toggle()
        return True

    GLib.io_add_watch(server.fileno(), GLib.PRIORITY_DEFAULT, GLib.IO_IN, accept)
    return server


def cleanup():
    for path in (PANEL_FLAG, LAYER_SOCKET):
        if path:
            try:
                os.unlink(path)
            except OSError:
                pass


provider = Gtk.CssProvider()
provider.load_from_data(CSS.encode('utf-8'))
Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)

osd = VolumeOsd()
sidebar = Sidebar()
panel = Panel()
control_server = start_control_socket()
try:
    os.unlink(PANEL_FLAG)  # Un panneau ne peut pas être resté ouvert d'un lancement précédent.
except OSError:
    pass

signal.signal(signal.SIGUSR1, lambda *_args: GLib.idle_add(sidebar.expand))
signal.signal(signal.SIGUSR2, lambda *_args: GLib.idle_add(sidebar.collapse))
GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, lambda *_args: Gtk.main_quit() or False)
# Contrairement à signal.signal, réveille GTK aussitôt : la manette doit réagir sans délai.
GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGHUP, sidebar.toggle_peek)
sidebar.window.set_size_request(20, -1)
GLib.timeout_add(350, refresh_state)
refresh_state()
sidebar.window.show_all()
osd.box.set_opacity(0.0)
osd.window.hide()
panel.dim.window.hide()
sidebar.rail.set_opacity(0)
sidebar.drawer.set_opacity(0)
sidebar.collapse()
try:
    Gtk.main()
finally:
    cleanup()
