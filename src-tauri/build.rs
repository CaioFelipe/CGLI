use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    if let Ok(out_dir) = env::var("OUT_DIR") {
        let out_path = PathBuf::from(&out_dir);
        if let Some(target_dir) = out_path.ancestors().nth(3) {
            let src_manifest = PathBuf::from("app.exe.manifest");
            let dest_manifest = target_dir.join("app.exe.manifest");
            if src_manifest.exists() {
                let _ = fs::copy(&src_manifest, &dest_manifest);
            }
        }
    }
    tauri_build::build();
}
