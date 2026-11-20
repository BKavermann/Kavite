#!/bin/sh
# Builds the Android app android/build/kavite.apk without Android Studio or Gradle.
# Needs: node/npm, a JDK, and the Ubuntu/Debian packages
#   android-sdk-platform-23 aapt dalvik-exchange zipalign apksigner
# Signing key: android/kavite-release.keystore, password in android/keystore.txt
# (both created on the first run; keep them, updates must be signed with the same key).
set -e
cd "$(dirname "$0")/.."
A=android; B=$A/build
JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}

# App version from src/config.js (VERSION '0.40' -> versionName 0.40, versionCode 40)
VER=$(sed -n "s/^export const VERSION = '\(.*\)';/\1/p" src/config.js)
CODE=$(echo "$VER" | awk -F. '{print $1 * 100 + $2}')
sed -i "s/android:versionCode=\"[0-9]*\"/android:versionCode=\"$CODE\"/; s/android:versionName=\"[^\"]*\"/android:versionName=\"$VER\"/" $A/AndroidManifest.xml

npm run build
rm -rf $B && mkdir -p $B/gen $B/obj $B/assets
cp -r dist $B/assets/www

if [ ! -f $A/kavite-release.keystore ]; then
  PASS=$(head -c 18 /dev/urandom | base64 | tr -d '/+=')
  echo "$PASS" > $A/keystore.txt
  keytool -genkeypair -keystore $A/kavite-release.keystore -alias kavite -keyalg RSA -keysize 3072 \
    -validity 10000 -storepass "$PASS" -keypass "$PASS" -dname "CN=Kavite, O=kavs.de, C=DE"
fi
PASS=$(cat $A/keystore.txt)

aapt package -f -m -J $B/gen -M $A/AndroidManifest.xml -S $A/res -I $JAR
javac -source 8 -target 8 -nowarn -Xlint:-options -bootclasspath $JAR -d $B/obj \
  $B/gen/de/kavs/kavite/R.java $(find $A/src -name '*.java')
dalvik-exchange --dex --output=$B/classes.dex $B/obj
aapt package -f -M $A/AndroidManifest.xml -S $A/res -A $B/assets -I $JAR -0 arsc -F $B/unsigned.apk
(cd $B && aapt add -f unsigned.apk classes.dex > /dev/null)
zipalign -p -f 4 $B/unsigned.apk $B/aligned.apk
apksigner sign --ks $A/kavite-release.keystore --ks-key-alias kavite --ks-pass pass:"$PASS" --key-pass pass:"$PASS" \
  --out $B/kavite.apk $B/aligned.apk
apksigner verify $B/kavite.apk
echo "built $B/kavite.apk"
