"""Compiles the app's (small) resource set without aapt2.

Writes, into <out>:
  AndroidManifest.xml                         binary XML (APK)
  resources.arsc                              binary resource table (APK)
  res/mipmap-anydpi-v26/ic_launcher*.xml      binary XML adaptive icons (APK)
  spec.json                                   the same model, consumed by ProtoGen.java
                                              to emit the protobuf form used in the AAB

Usage: python3 res_build.py <android-app dir> <out dir> <versionCode> <versionName>
"""
import json
import os
import shutil
import struct
import sys

ROOT, OUT, VERSION_CODE, VERSION_NAME = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
PACKAGE = os.environ.get('LG_APP_ID') or 'com.lessonguruodisha.app'  # app id (the direct version has its own)
JAVA_PKG = 'com.lessonguruodisha.app'  # where the classes live, same for every version
MIN_SDK, TARGET_SDK, COMPILE_SDK = 24, 36, 35  # Play requires target 36 for new apps/updates from 31 Aug 2026
ANDROID_NS = 'http://schemas.android.com/apk/res/android'

# ---- framework ids (android.R.attr / android.R.style, API 35) ----
A = {
    'theme': 0x01010000, 'label': 0x01010001, 'icon': 0x01010002, 'name': 0x01010003,
    'exported': 0x01010010, 'configChanges': 0x0101001f, 'launchMode': 0x0101001d,
    'screenOrientation': 0x0101001e, 'host': 0x01010028, 'scheme': 0x01010027,
    'versionCode': 0x0101021b, 'versionName': 0x0101021c, 'minSdkVersion': 0x0101020c,
    'targetSdkVersion': 0x01010270, 'maxSdkVersion': 0x01010271, 'windowSoftInputMode': 0x0101022b,
    'allowBackup': 0x01010280, 'hardwareAccelerated': 0x010102d3, 'supportsRtl': 0x010103af,
    'usesCleartextTraffic': 0x010104ec, 'roundIcon': 0x0101052c, 'drawable': 0x01010199,
    'compileSdkVersion': 0x01010572, 'compileSdkVersionCodename': 0x01010573,
    'largeHeap': 0x0101035a, 'autoVerify': 0x010104ee, 'enableOnBackInvokedCallback': 0x0101066c,
    'windowBackground': 0x01010054, 'statusBarColor': 0x01010451, 'navigationBarColor': 0x01010452,
    'colorPrimary': 0x01010433, 'colorPrimaryDark': 0x01010434, 'colorAccent': 0x01010435,
    'windowLightStatusBar': 0x010104e0, 'windowSplashScreenBackground': 0x0101062c,
    'windowSplashScreenAnimatedIcon': 0x0101062d, 'windowSplashScreenIconBackgroundColor': 0x01010630,
}
# sanity: values above were read with javap from android.R (see README)
assert A['windowSplashScreenBackground'] == 16844332 and A['roundIcon'] == 16844076
THEME_MATERIAL_LIGHT_NOACTIONBAR = 16974401

# ---- app resource table model ----
PKG_ID = 0x7f
DENS = [('mdpi', 160), ('hdpi', 240), ('xhdpi', 320), ('xxhdpi', 480), ('xxxhdpi', 640)]
ANYDPI = 0xFFFE

# types (id order matters): 1 color, 2 mipmap, 3 style
COLORS = [('brand_primary', 0xFF6D28D9), ('brand_accent', 0xFFFF2D78), ('splash_bg', 0xFF4C1D95)]
MIPMAPS = ['ic_launcher', 'ic_launcher_round', 'ic_launcher_background', 'ic_launcher_foreground']
STYLES = ['AppTheme']


def rid(type_id, entry):
    return (PKG_ID << 24) | (type_id << 16) | entry


def color_id(n):
    return rid(1, [c[0] for c in COLORS].index(n))


def mipmap_id(n):
    return rid(2, MIPMAPS.index(n))


STYLE_APPTHEME = rid(3, 0)

# style items: (attr name, kind, value)
THEME_ITEMS = [
    ('windowBackground', 'color', COLORS[2][1]),
    ('statusBarColor', 'color', COLORS[2][1]),
    ('navigationBarColor', 'color', 0xFFFFFFFF),
    ('colorPrimary', 'color', COLORS[0][1]),
    ('colorPrimaryDark', 'color', COLORS[2][1]),
    ('colorAccent', 'color', COLORS[1][1]),
    ('windowSplashScreenBackground', 'color', COLORS[2][1]),
    ('windowSplashScreenAnimatedIcon', 'ref', mipmap_id('ic_launcher_foreground')),
]

# ---- Res_value types ----
T_REF, T_STRING, T_DEC, T_HEX, T_BOOL, T_ARGB8 = 0x01, 0x03, 0x10, 0x11, 0x12, 0x1c


# ======================================================================
#  Manifest model: (tag, [attrs], [children]); attr = (name, kind, value)
#  kinds: str, int, hex, bool, ref
# ======================================================================
def el(tag, attrs=None, children=None):
    return {'tag': tag, 'attrs': attrs or [], 'children': children or []}


def manifest():
    activity = el('activity', [
        ('name', 'str', JAVA_PKG + '.MainActivity'),
        ('exported', 'bool', True),
        ('launchMode', 'int', 2),               # singleTask
        ('screenOrientation', 'int', 1),        # portrait
        ('configChanges', 'hex', 0x3ff0),       # orientation|screenSize|keyboard|uiMode|density... keep WebView alive
        ('windowSoftInputMode', 'hex', 0x10),   # adjustResize
        ('theme', 'ref', STYLE_APPTHEME),
    ], [
        el('intent-filter', [], [
            el('action', [('name', 'str', 'android.intent.action.MAIN')]),
            el('category', [('name', 'str', 'android.intent.category.LAUNCHER')]),
        ]),
        el('intent-filter', [('autoVerify', 'bool', True)], [
            el('action', [('name', 'str', 'android.intent.action.VIEW')]),
            el('category', [('name', 'str', 'android.intent.category.DEFAULT')]),
            el('category', [('name', 'str', 'android.intent.category.BROWSABLE')]),
            el('data', [('scheme', 'str', 'https')]),
            el('data', [('host', 'str', 'lessonguruodisha.com')]),
            el('data', [('host', 'str', 'www.lessonguruodisha.com')]),
        ]),
    ])
    app = el('application', [
        ('theme', 'ref', STYLE_APPTHEME),
        ('label', 'str', 'Lesson Guru Odisha'),
        ('icon', 'ref', mipmap_id('ic_launcher')),
        ('allowBackup', 'bool', True),
        ('hardwareAccelerated', 'bool', True),
        ('largeHeap', 'bool', True),
        ('supportsRtl', 'bool', True),
        ('usesCleartextTraffic', 'bool', False),
        ('enableOnBackInvokedCallback', 'bool', True),  # predictive back (default from target 36)
        ('roundIcon', 'ref', mipmap_id('ic_launcher_round')),
    ], [activity])
    return el('manifest', [
        ('versionCode', 'int', VERSION_CODE),
        ('versionName', 'str', VERSION_NAME),
        ('compileSdkVersion', 'int', COMPILE_SDK),
        ('compileSdkVersionCodename', 'str', '15'),
        ('package', 'str', PACKAGE),
        ('platformBuildVersionCode', 'int', COMPILE_SDK),
        ('platformBuildVersionName', 'str', '15'),
    ], [
        el('uses-sdk', [('minSdkVersion', 'int', MIN_SDK), ('targetSdkVersion', 'int', TARGET_SDK)]),
        el('uses-permission', [('name', 'str', 'android.permission.INTERNET')]),
        el('uses-permission', [('name', 'str', 'android.permission.ACCESS_NETWORK_STATE')]),
        el('uses-permission', [('name', 'str', 'android.permission.WRITE_EXTERNAL_STORAGE'), ('maxSdkVersion', 'int', 28)]),
        el('queries', [], [
            el('intent', [], [el('action', [('name', 'str', 'android.intent.action.VIEW')]),
                              el('data', [('scheme', 'str', 'upi')])]),
            el('intent', [], [el('action', [('name', 'str', 'android.intent.action.VIEW')]),
                              el('data', [('scheme', 'str', 'https')])]),
            el('package', [('name', 'str', 'com.whatsapp')]),
            el('package', [('name', 'str', 'com.whatsapp.w4b')]),
        ]),
        app,
    ])


def adaptive_icon():
    return el('adaptive-icon', [], [
        el('background', [('drawable', 'ref', mipmap_id('ic_launcher_background'))]),
        el('foreground', [('drawable', 'ref', mipmap_id('ic_launcher_foreground'))]),
    ])


# ======================================================================
#  Binary chunk writers
# ======================================================================
def pad4(b):
    return b + b'\0' * ((4 - len(b) % 4) % 4)


def string_pool(strings):
    """UTF-16 string pool chunk."""
    offsets, data = [], b''
    for s in strings:
        offsets.append(len(data))
        enc = s.encode('utf-16-le')
        n = len(enc) // 2
        if n > 0x7FFF:
            raise ValueError('string too long')
        data += struct.pack('<H', n) + enc + b'\0\0'
    data = pad4(data)
    header_size = 28
    strings_start = header_size + 4 * len(strings)
    body = b''.join(struct.pack('<I', o) for o in offsets) + data
    size = header_size + len(body)
    return struct.pack('<HHIIIIII', 0x0001, header_size, size, len(strings), 0, 0, strings_start, 0) + body


def axml(root):
    """Encodes an element tree as Android binary XML."""
    # collect strings: attribute names that have resource ids first (resource map), then the rest
    attr_names = []
    others = []

    def walk(n):
        for name, _, _ in n['attrs']:
            if name in A:
                if name not in attr_names:
                    attr_names.append(name)
            elif name not in others:
                others.append(name)
        for c in n['children']:
            walk(c)
    walk(root)
    strings = list(attr_names)

    def S(s):
        if s not in strings:
            strings.append(s)
        return strings.index(s)

    S('android')
    S(ANDROID_NS)
    for o in others:
        S(o)

    chunks = []
    ns_prefix, ns_uri = S('android'), S(ANDROID_NS)
    chunks.append(struct.pack('<HHIII', 0x0100, 16, 24, 1, 0xFFFFFFFF) + struct.pack('<II', ns_prefix, ns_uri))

    def emit(n, line=[2]):
        name_idx = S(n['tag'])
        attrs = []
        for aname, kind, val in n['attrs']:
            ns = ns_uri if aname in A else 0xFFFFFFFF
            raw = 0xFFFFFFFF
            if kind == 'str':
                raw = S(val)
                vt, data = T_STRING, raw
            elif kind == 'int':
                vt, data = T_DEC, val
            elif kind == 'hex':
                vt, data = T_HEX, val
            elif kind == 'bool':
                vt, data = T_BOOL, 0xFFFFFFFF if val else 0
            elif kind == 'ref':
                vt, data = T_REF, val
            else:
                raise ValueError(kind)
            attrs.append((A.get(aname, 0xFFFFFFFF), ns, S(aname), raw, vt, data))
        # aapt orders attributes by resource id; non-framework attrs go last
        attrs.sort(key=lambda a: (a[0] == 0xFFFFFFFF, a[0]))
        body = struct.pack('<IIHHHHHH', 0xFFFFFFFF, name_idx, 20, 20, len(attrs), 0, 0, 0)
        for _, ns, nidx, raw, vt, data in attrs:
            body += struct.pack('<IIIHBBI', ns, nidx, raw, 8, 0, vt, data & 0xFFFFFFFF)
        chunks.append(struct.pack('<HHIII', 0x0102, 16, 16 + len(body), line[0], 0xFFFFFFFF) + body)
        line[0] += 1
        for c in n['children']:
            emit(c)
        chunks.append(struct.pack('<HHIII', 0x0103, 16, 24, line[0], 0xFFFFFFFF) + struct.pack('<II', 0xFFFFFFFF, name_idx))
        line[0] += 1

    emit(root)
    chunks.append(struct.pack('<HHIII', 0x0101, 16, 24, 1, 0xFFFFFFFF) + struct.pack('<II', ns_prefix, ns_uri))

    pool = string_pool(strings)
    resmap_body = b''.join(struct.pack('<I', A[n]) for n in attr_names)
    resmap = struct.pack('<HHI', 0x0180, 8, 8 + len(resmap_body)) + resmap_body
    body = pool + resmap + b''.join(chunks)
    return struct.pack('<HHI', 0x0003, 8, 8 + len(body)) + body


def res_config(density=0, sdk=0):
    """ResTable_config, 64 bytes."""
    cfg = bytearray(64)
    struct.pack_into('<I', cfg, 0, 64)
    struct.pack_into('<H', cfg, 14, density)   # density lives after orientation/touchscreen
    struct.pack_into('<H', cfg, 24, sdk)       # sdkVersion
    return bytes(cfg)


def type_chunk(type_id, entry_count, entries, config):
    """entries: dict entry_index -> bytes (ResTable_entry + value)."""
    header_size = 20 + len(config)
    offsets, data = [], b''
    for i in range(entry_count):
        if i in entries:
            offsets.append(len(data))
            data += entries[i]
        else:
            offsets.append(0xFFFFFFFF)
    entries_start = header_size + 4 * entry_count
    body = b''.join(struct.pack('<I', o) for o in offsets) + data
    size = header_size + len(body)
    return struct.pack('<HHIBBHII', 0x0201, header_size, size, type_id, 0, 0, entry_count, entries_start) + config + body


def typespec_chunk(type_id, flags):
    body = b''.join(struct.pack('<I', f) for f in flags)
    return struct.pack('<HHIBBHI', 0x0202, 16, 16 + len(body), type_id, 0, 0, len(flags)) + body


def simple_entry(key_idx, vtype, data):
    return struct.pack('<HHI', 8, 0, key_idx) + struct.pack('<HBBI', 8, 0, vtype, data & 0xFFFFFFFF)


def arsc(file_paths):
    """file_paths: {(mipmap_name, density, sdk): 'res/...'}"""
    global_strings = []

    def G(s):
        if s not in global_strings:
            global_strings.append(s)
        return global_strings.index(s)

    type_names = ['color', 'mipmap', 'style']
    keys = [c[0] for c in COLORS] + MIPMAPS + STYLES

    def K(n):
        return keys.index(n)

    out = b''
    # color
    ents = {i: simple_entry(K(n), T_ARGB8, v) for i, (n, v) in enumerate(COLORS)}
    out += typespec_chunk(1, [0] * len(COLORS))
    out += type_chunk(1, len(COLORS), ents, res_config())
    # mipmap
    configs = {}
    for (name, dens, sdk), path in file_paths.items():
        configs.setdefault((dens, sdk), {})[MIPMAPS.index(name)] = simple_entry(K(name), T_STRING, G(path))
    spec_flags = []
    for i, name in enumerate(MIPMAPS):
        f = 0x0100  # CONFIG_DENSITY
        if any(k[0] == name and k[2] for k in file_paths):
            f |= 0x0400  # CONFIG_VERSION
        spec_flags.append(f)
    out += typespec_chunk(2, spec_flags)
    for (dens, sdk) in sorted(configs):
        out += type_chunk(2, len(MIPMAPS), configs[(dens, sdk)], res_config(dens, sdk))
    # style (bag entry)
    items = b''
    # bag entries must be sorted by attribute id: the runtime binary-searches/merges them
    for aname, kind, val in sorted(THEME_ITEMS, key=lambda it: A[it[0]]):
        vt = T_ARGB8 if kind == 'color' else T_REF
        items += struct.pack('<I', A[aname]) + struct.pack('<HBBI', 8, 0, vt, val & 0xFFFFFFFF)
    bag = struct.pack('<HHI', 16, 0x0001, K('AppTheme')) + struct.pack('<II', THEME_MATERIAL_LIGHT_NOACTIONBAR, len(THEME_ITEMS)) + items
    out += typespec_chunk(3, [0])
    out += type_chunk(3, 1, {0: bag}, res_config())

    type_pool = string_pool(type_names)
    key_pool = string_pool(keys)
    pkg_header_size = 288
    name = PACKAGE.encode('utf-16-le').ljust(256, b'\0')
    type_strings_off = pkg_header_size
    key_strings_off = pkg_header_size + len(type_pool)
    pkg_body = type_pool + key_pool + out
    pkg = struct.pack('<HHII', 0x0200, pkg_header_size, pkg_header_size + len(pkg_body), PKG_ID) + name + \
        struct.pack('<IIIII', type_strings_off, len(type_names), key_strings_off, len(keys), 0) + pkg_body
    assert len(pkg) - len(pkg_body) == pkg_header_size
    gpool = string_pool(global_strings)
    body = gpool + pkg
    return struct.pack('<HHII', 0x0002, 12, 12 + len(body), 1) + body


# ======================================================================
def main():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    res_src = os.path.join(ROOT, 'res')
    file_paths = {}
    copies = []
    for qual, dens in DENS:
        for name in MIPMAPS:
            src = os.path.join(res_src, f'mipmap-{qual}', name + '.png')
            dst = f'res/mipmap-{qual}-v4/{name}.png'
            file_paths[(name, dens, 4)] = dst
            copies.append((src, dst))
    # adaptive icons (binary xml)
    adaptive = axml(adaptive_icon())
    for name in ('ic_launcher', 'ic_launcher_round'):
        dst = f'res/mipmap-anydpi-v26/{name}.xml'
        file_paths[(name, ANYDPI, 26)] = dst
        p = os.path.join(OUT, 'apk', dst)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'wb').write(adaptive)
    for src, dst in copies:
        p = os.path.join(OUT, 'apk', dst)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        shutil.copyfile(src, p)

    open(os.path.join(OUT, 'apk', 'AndroidManifest.xml'), 'wb').write(axml(manifest()))
    open(os.path.join(OUT, 'apk', 'resources.arsc'), 'wb').write(arsc(file_paths))

    # spec for the protobuf (AAB) encoder
    spec = {
        'package': PACKAGE, 'pkgId': PKG_ID, 'androidNs': ANDROID_NS, 'attrIds': A,
        'manifest': manifest(), 'adaptiveIcon': adaptive_icon(),
        'colors': [{'name': n, 'id': color_id(n), 'argb': v} for n, v in COLORS],
        'mipmaps': [{'name': n, 'id': mipmap_id(n), 'files': [
            {'density': d, 'sdk': s, 'path': p} for (mn, d, s), p in sorted(file_paths.items()) if mn == n]}
            for n in MIPMAPS],
        'styles': [{'name': 'AppTheme', 'id': STYLE_APPTHEME, 'parent': THEME_MATERIAL_LIGHT_NOACTIONBAR,
                    'items': [{'attr': a, 'attrId': A[a], 'kind': k, 'value': v} for a, k, v in THEME_ITEMS]}],
    }
    json.dump(spec, open(os.path.join(OUT, 'spec.json'), 'w'), indent=1)
    print('resources compiled ->', OUT)


if __name__ == '__main__':
    main()
