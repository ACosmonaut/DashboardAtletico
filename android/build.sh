set -euo pipefail
cd "$(dirname "$0")"
tools=$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)
platform=$(find "$ANDROID_HOME/platforms" -name android.jar | sort -V | tail -1)
mkdir -p build/classes build/dex
javac --release 8 -classpath "$platform" -d build/classes PreviewActivity.java
"$tools/d8" --min-api 23 --lib "$platform" --output build/dex build/classes/it/atleticosanlorenzo/anteprima/PreviewActivity.class
"$tools/aapt" package -f -M AndroidManifest.xml -I "$platform" -A assets -F build/unsigned.apk
cp build/dex/classes.dex build/classes.dex
(cd build && "$tools/aapt" add unsigned.apk classes.dex)
"$tools/zipalign" -f 4 build/unsigned.apk build/aligned.apk
keytool -genkeypair -keystore build/preview.jks -storepass android -keypass android -alias preview -keyalg RSA -keysize 2048 -validity 365 -dname "CN=Atletico Anteprima"
"$tools/apksigner" sign --ks build/preview.jks --ks-pass pass:android --out Atletico-anteprima.apk build/aligned.apk
"$tools/apksigner" verify Atletico-anteprima.apk
