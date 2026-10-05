// One-time carry-over of data from the app's former GladiaFlow names.
//
// - Config dir ({config_dir}/gladiaflow: API key, settings, history.db) is
//   COPIED to {config_dir}/speakdrop. The official GladiaFlow app reads the
//   same folder, so it must stay intact.
// - Local app data for the dev build ({data_local_dir}/io.gladia.gladiaflow.dev:
//   WebView storage such as dictation stats and the pill position, plus logs)
//   is MOVED to the new identifier's folder. Only this fork ever used the
//   ".dev" identifier; the release identifier belongs to official GladiaFlow,
//   so its data is left alone.
//
// Both steps are skipped once the destination exists, so this is idempotent.

use std::fs;
use std::io;
use std::path::Path;

pub const LEGACY_CONFIG_DIR_NAME: &str = "gladiaflow";
pub const CONFIG_DIR_NAME: &str = "speakdrop";
const LEGACY_DEV_IDENTIFIER: &str = "io.gladia.gladiaflow.dev";

fn copy_dir_recursive(src: &Path, dst: &Path) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let target = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

/// Copy `legacy` to `new` if `legacy` exists and `new` does not.
/// Returns whether anything was copied. A partial copy is removed on error
/// so the next launch can retry.
pub fn copy_dir_if_missing(legacy: &Path, new: &Path) -> io::Result<bool> {
    if new.exists() || !legacy.is_dir() {
        return Ok(false);
    }
    if let Err(error) = copy_dir_recursive(legacy, new) {
        let _ = fs::remove_dir_all(new);
        return Err(error);
    }
    Ok(true)
}

/// Move `legacy` to `new` if `legacy` exists and `new` does not.
pub fn move_dir_if_missing(legacy: &Path, new: &Path) -> io::Result<bool> {
    if new.exists() || !legacy.is_dir() {
        return Ok(false);
    }
    if let Some(parent) = new.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(legacy, new)?;
    Ok(true)
}

/// Run before the Tauri runtime starts (WebView storage must not be open).
/// Returns human-readable outcomes to log once logging is up.
pub fn run(identifier: &str) -> Vec<String> {
    let mut outcomes = Vec::new();

    if let Some(base) = dirs::config_dir() {
        let legacy = base.join(LEGACY_CONFIG_DIR_NAME);
        let new = base.join(CONFIG_DIR_NAME);
        match copy_dir_if_missing(&legacy, &new) {
            Ok(true) => outcomes.push(format!(
                "copied settings from {} to {}",
                legacy.display(),
                new.display()
            )),
            Ok(false) => {}
            Err(error) => outcomes.push(format!("failed to copy legacy settings: {error}")),
        }
    }

    if identifier.ends_with(".dev") && identifier != LEGACY_DEV_IDENTIFIER {
        if let Some(base) = dirs::data_local_dir() {
            let legacy = base.join(LEGACY_DEV_IDENTIFIER);
            let new = base.join(identifier);
            match move_dir_if_missing(&legacy, &new) {
                Ok(true) => outcomes.push(format!(
                    "moved app data from {} to {}",
                    legacy.display(),
                    new.display()
                )),
                Ok(false) => {}
                Err(error) => outcomes.push(format!("failed to move legacy app data: {error}")),
            }
        }
    }

    outcomes
}

#[cfg(test)]
mod tests {
    use super::{copy_dir_if_missing, move_dir_if_missing};
    use std::fs;
    use std::path::PathBuf;

    fn temp_root(name: &str) -> PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "speakdrop-migration-test-{name}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn copies_nested_files_and_keeps_the_original() {
        let root = temp_root("copy");
        let legacy = root.join("gladiaflow");
        fs::create_dir_all(legacy.join("sub")).unwrap();
        fs::write(legacy.join("config.json"), "{\"k\":1}").unwrap();
        fs::write(legacy.join("sub").join("history.db"), "db").unwrap();
        let new = root.join("speakdrop");

        assert!(copy_dir_if_missing(&legacy, &new).unwrap());
        assert_eq!(fs::read_to_string(new.join("config.json")).unwrap(), "{\"k\":1}");
        assert_eq!(
            fs::read_to_string(new.join("sub").join("history.db")).unwrap(),
            "db"
        );
        assert!(legacy.join("config.json").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn never_overwrites_an_existing_destination() {
        let root = temp_root("existing");
        let legacy = root.join("gladiaflow");
        let new = root.join("speakdrop");
        fs::create_dir_all(&legacy).unwrap();
        fs::write(legacy.join("config.json"), "old").unwrap();
        fs::create_dir_all(&new).unwrap();
        fs::write(new.join("config.json"), "new").unwrap();

        assert!(!copy_dir_if_missing(&legacy, &new).unwrap());
        assert!(!move_dir_if_missing(&legacy, &new).unwrap());
        assert_eq!(fs::read_to_string(new.join("config.json")).unwrap(), "new");
        assert!(legacy.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn does_nothing_without_legacy_data() {
        let root = temp_root("none");
        let new = root.join("speakdrop");
        assert!(!copy_dir_if_missing(&root.join("missing"), &new).unwrap());
        assert!(!move_dir_if_missing(&root.join("missing"), &new).unwrap());
        assert!(!new.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn moves_a_directory() {
        let root = temp_root("move");
        let legacy = root.join("old.dev");
        fs::create_dir_all(legacy.join("EBWebView")).unwrap();
        fs::write(legacy.join("EBWebView").join("Local State"), "x").unwrap();
        let new = root.join("nested").join("new.dev");

        assert!(move_dir_if_missing(&legacy, &new).unwrap());
        assert!(new.join("EBWebView").join("Local State").exists());
        assert!(!legacy.exists());
        fs::remove_dir_all(root).unwrap();
    }
}
