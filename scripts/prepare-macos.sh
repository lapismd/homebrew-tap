#!/bin/sh
set -eu
bundle=$1
[ -d "$bundle" ] && [ ! -L "$bundle" ] || { echo 'Lapis Notes application bundle is missing or is a symlink' >&2; exit 1; }
identifier=$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "$bundle/Contents/Info.plist")
[ "$identifier" = notes.lapis.desktop ] || { echo 'Refusing to prepare a different macOS application' >&2; exit 1; }
/usr/bin/codesign --verify --deep --strict "$bundle"
attributes=$(/usr/bin/xattr -r "$bundle")
case "$attributes" in
  *com.apple.quarantine*) /usr/bin/xattr -dr com.apple.quarantine "$bundle" ;;
esac
attributes=$(/usr/bin/xattr -r "$bundle")
case "$attributes" in
  *com.apple.quarantine*) echo 'Unable to remove quarantine from Lapis Notes' >&2; exit 1 ;;
esac
/usr/bin/codesign --verify --deep --strict "$bundle"
