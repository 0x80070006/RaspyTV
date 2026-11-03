#!/usr/bin/env python3
"""Configure borderless, maximized Moonlight without exclusive pointer capture.

Runs once before launch; no polling process during streaming. Preserve pairing
and other preferences, and back up the original compositor configuration.
"""
import os
from pathlib import Path
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET

config_root = Path(os.environ.get('XDG_CONFIG_HOME', str(Path.home() / '.config')))
settings = config_root / 'Moonlight Game Streaming Project' / 'Moonlight.conf'
original = settings.read_text() if settings.exists() else '[General]\n'
lines = original.splitlines(keepends=True)
general = next((i for i, line in enumerate(lines) if line.strip() == '[General]'), None)
if general is None:
    lines[0:0] = ['[General]\n']
    general = 0
end = next((i for i in range(general + 1, len(lines)) if lines[i].lstrip().startswith('[')), len(lines))
values = {'windowmode': '2', 'mouseacceleration': 'true', 'uidisplaymode': '1'}
section = [line for line in lines[general + 1:end] if line.split('=', 1)[0].strip() not in values]
section += [f'{key}={value}\n' for key, value in values.items()]
lines[general + 1:end] = section
updated = ''.join(lines)
if updated != original:
    settings.parent.mkdir(parents=True, exist_ok=True)
    if settings.exists() and not settings.with_suffix('.raspytv-backup').exists():
        shutil.copy2(settings, settings.with_suffix('.raspytv-backup'))
    temporary = settings.with_suffix('.tmp')
    temporary.write_text(updated)
    temporary.chmod(0o600)
    temporary.replace(settings)

rc = config_root / 'labwc' / 'rc.xml'
source = rc if rc.exists() else Path('/etc/xdg/labwc/rc.xml')
xml = source.read_text()
ET.fromstring(xml)
if '<!-- RaspyTV Moonlight mouse-safe kiosk v2 -->' not in xml:
    # Remove only the exact legacy blocks written by this setup, not user rules.
    legacy = '<windowRules><windowRule identifier="com.moonlight_stream.Moonlight" serverDecoration="no"><action name="Maximize" /></windowRule></windowRules>'
    xml = xml.replace(legacy, '')
    rule = '\n<!-- RaspyTV Moonlight mouse-safe kiosk v2 -->\n' + ''.join(
        f'<windowRule identifier="{identifier}" serverDecoration="no"><action name="Maximize" /></windowRule>\n'
        for identifier in ['com.moonlight_stream.Moonlight', 'Moonlight'])
    if '</windowRules>' in xml:
        xml = xml.replace('</windowRules>', rule + '</windowRules>', 1)
    else:
        xml = re.sub(r'(</[^>]+>\s*)$', lambda match: '<windowRules>' + rule + '</windowRules>\n' + match.group(1), xml, count=1)
    ET.fromstring(xml)
    rc.parent.mkdir(parents=True, exist_ok=True)
    backup = rc.with_suffix('.raspytv-backup')
    if not backup.exists():
        shutil.copy2(source, backup)
    rc.write_text(xml)

# Reconfigure on every invocation. If a previous reconfigure failed after the
# atomic XML write, the marker is already present and must not suppress retry.
environment = os.environ.copy()
if not environment.get('LABWC_PID'):
    environment['LABWC_PID'] = subprocess.check_output(
        ['pgrep', '-u', str(os.getuid()), '-x', 'labwc'], text=True).strip().splitlines()[0]
subprocess.run(['labwc', '--reconfigure'], env=environment, check=True, timeout=5)
