# Launch test

Starts the real `MainActivity` on real Android framework code (Robolectric) for each supported
Android version. It uses the classes and the hand-written binary `resources.arsc` produced by
`build-tools/build.py`, so it catches startup crashes and resource-table problems without a phone.

```bash
python3 ../build-tools/build.py --tools /path/to/tools        # builds ../build/classes + app-unsigned.apk
python3 build-monitor.py /path/to/android-all.jar:<deps>     # only if Google Maven is unreachable (see below)
gradle test -Ptools=/path/to/tools
```

Robolectric depends on `androidx.test:monitor`, which is published only on Google Maven. If
that repository is reachable, delete the `configurations.all { exclude … }` block and the
`monitor.jar` line in `build.gradle`. Otherwise `build-monitor.py` compiles the few classes
Robolectric uses from the official `android/android-test` sources into `build/monitor/monitor.jar`.
