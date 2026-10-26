"""Builds androidx.test:monitor (+ espresso IdlingRegistry) classes Robolectric needs, from the
official android/android-test sources on GitHub, compiling iteratively until javac is happy."""
import os, re, subprocess, sys, urllib.request
BASE = 'https://raw.githubusercontent.com/android/android-test/main/'
ROOTS = ['runner/monitor/java/', 'espresso/idling_resource/java/', 'runner/android_junit_runner/java/', 'core/java/']
OUT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(OUT, 'src')
ANDROID = sys.argv[1]
WANT = sys.argv[2:]
missing_cache = set()

def fetch(cls):
    rel = cls.replace('.', '/') + '.java'
    dst = os.path.join(SRC, rel)
    if os.path.exists(dst) or cls in missing_cache:
        return os.path.exists(dst)
    if cls.startswith('androidx.annotation.') and cls != 'androidx.annotation.RestrictTo':
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        pkg, name = cls.rsplit('.', 1)
        open(dst, 'w').write(f'package {pkg};\nimport java.lang.annotation.*;\n@Retention(RetentionPolicy.CLASS)\npublic @interface {name} {{ String[] value() default {{}}; String otherwise() default ""; int api() default 0; Class<?>[] scope() default {{}}; long from() default 0; long to() default 0; }}\n')
        return True
    for root in ROOTS:
        try:
            data = urllib.request.urlopen(BASE + root + rel, timeout=30).read()
        except Exception:
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        open(dst, 'wb').write(data)
        for imp in re.findall(rb'^import (?:static )?(androidx\.[\w.]+?)(?:\.[a-z]\w*)?;', data, re.M):
            name = imp.decode()
            # static imports: drop the member name if it starts lower-case
            parts = name.split('.')
            while parts and parts[-1][:1].islower() and len(parts) > 2 and parts[-2][:1].isupper():
                parts.pop()
            fetch('.'.join(parts))
        return True
    missing_cache.add(cls)
    print('  not found:', cls)
    return False

for c in WANT:
    fetch(c.replace('/', '.'))

for rnd in range(30):
    files = [os.path.join(d, f) for d, _, fs in os.walk(SRC) for f in fs if f.endswith('.java')]
    r = subprocess.run(['javac', '-nowarn', '-source', '8', '-target', '8', '-Xlint:-options', '-proc:none', '-cp', ANDROID,
                        '-d', os.path.join(OUT, 'classes'), '-Xmaxerrs', '2000'] + files, capture_output=True, text=True)
    if r.returncode == 0:
        print('compiled', len(files), 'files')
        break
    err = r.stderr
    added = False
    # "cannot find symbol ... symbol: class Foo ... location: package androidx.x" or in a file of package p
    for m in re.finditer(r'^(.*\.java):\d+: error: (?:cannot find symbol|package ([\w.]+) does not exist)\n.*\n.*\n\s+symbol:\s+(?:class|variable) (\w+)(?:\n\s+location: (?:package|class) ([\w.]+))?', err, re.M):
        path, pkgmissing, sym, loc = m.groups()
        pkg = open(path).read().split('package ', 1)[1].split(';', 1)[0].strip()
        for cand in ([loc + '.' + sym] if loc and loc.startswith('androidx') else []) + [pkg + '.' + sym]:
            if sym[:1].isupper() and fetch(cand):
                added = True
                break
    for m in re.finditer(r'error: package (androidx[\w.]+) does not exist', err):
        pass
    for m in re.finditer(r'import (androidx[\w.]+);', err):
        if fetch(m.group(1)): added = True
    if not added:
        print(err[:6000])
        sys.exit(1)
