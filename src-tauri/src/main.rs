// Prevents additional console window on Windows in release builds, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent};

fn get_python_executable(resource_dir: &Path) -> Option<String> {
    #[cfg(not(target_os = "windows"))]
    let rel_path = Path::new("python").join("bin").join("python3");
    #[cfg(target_os = "windows")]
    let rel_path = Path::new("python").join("python.exe");

    // 1. Direct path in resource_dir (e.g. <resource_dir>/python/bin/python3)
    let res_python = resource_dir.join(&rel_path);
    if res_python.exists() {
        let path_str = res_python.to_string_lossy().to_string();
        println!("[Tauri Supervisor] Using embedded Python:\n{}", path_str);
        return Some(path_str);
    }

    // 2. Subpath check for resources/python/bin/python3 (e.g. <resource_dir>/resources/python/bin/python3)
    let res_sub_python = resource_dir.join("resources").join(&rel_path);
    if res_sub_python.exists() {
        let path_str = res_sub_python.to_string_lossy().to_string();
        println!("[Tauri Supervisor] Using embedded Python:\n{}", path_str);
        return Some(path_str);
    }

    // 3. Subpath check for _up_/python/bin/python3 if relative resource path bundling structure used
    let res_up_python = resource_dir.join("_up_").join(&rel_path);
    if res_up_python.exists() {
        let path_str = res_up_python.to_string_lossy().to_string();
        println!("[Tauri Supervisor] Using embedded Python:\n{}", path_str);
        return Some(path_str);
    }

    // 4. Local development fallbacks relative to CWD
    #[cfg(not(target_os = "windows"))]
    let dev_python = Path::new("backend/venv/bin/python3");
    #[cfg(target_os = "windows")]
    let dev_python = Path::new("backend/venv/Scripts/python.exe");

    if dev_python.exists() {
        let path_str = dev_python.to_string_lossy().to_string();
        println!("[Tauri Supervisor] Using embedded Python:\n{}", path_str);
        return Some(path_str);
    }

    #[cfg(not(target_os = "windows"))]
    let parent_dev_python = Path::new("../backend/venv/bin/python3");
    #[cfg(target_os = "windows")]
    let parent_dev_python = Path::new("../backend/venv/Scripts/python.exe");

    if parent_dev_python.exists() {
        let path_str = parent_dev_python.to_string_lossy().to_string();
        println!("[Tauri Supervisor] Using embedded Python:\n{}", path_str);
        return Some(path_str);
    }

    // Print explicit diagnostic error and return None if missing from all checked paths
    eprintln!("\n==================================================================");
    eprintln!("[CRITICAL SUPERVISOR ERROR] Embedded Python Runtime Not Found!");
    eprintln!("==================================================================");
    eprintln!("  - Resolved Resource Directory: {}", resource_dir.display());
    eprintln!("  - Expected Embedded Executable Relative Path: {}", rel_path.display());
    eprintln!("  - Checked Resource Paths:");
    eprintln!("    • {}", res_python.display());
    eprintln!("    • {}", res_sub_python.display());
    eprintln!("    • {}", res_up_python.display());
    eprintln!("    • {}", dev_python.display());
    eprintln!("    • {}", parent_dev_python.display());
    eprintln!("==================================================================\n");

    None
}

fn get_run_script(resource_dir: &Path) -> Option<String> {
    // 1. Check in Tauri resource directory
    let res_script = resource_dir.join("run_production.py");
    if res_script.exists() {
        return Some(res_script.to_string_lossy().to_string());
    }

    let res_up_script = resource_dir.join("_up_").join("run_production.py");
    if res_up_script.exists() {
        return Some(res_up_script.to_string_lossy().to_string());
    }

    // 2. Fallback to local dev paths relative to CWD
    let local_script = Path::new("run_production.py");
    if local_script.exists() {
        return Some(local_script.to_string_lossy().to_string());
    }

    let parent_script = Path::new("../run_production.py");
    if parent_script.exists() {
        return Some(parent_script.to_string_lossy().to_string());
    }

    // Print detailed diagnostic if backend script resource is missing
    eprintln!("[Tauri Supervisor Diagnostic Error] ❌ Missing bundled resource: 'run_production.py' was not found!");
    eprintln!("  - Resolved Resource Directory: {}", resource_dir.display());
    eprintln!("  - Checked Resource Paths:");
    eprintln!("    • {}", res_script.display());
    eprintln!("    • {}", res_up_script.display());
    eprintln!("  - Checked Fallback Dev Paths:");
    eprintln!("    • {}", local_script.display());
    eprintln!("    • {}", parent_script.display());

    None
}

fn spawn_backend(child_mutex: &Arc<Mutex<Option<Child>>>, resource_dir: &Path) {
    let python_exe = match get_python_executable(resource_dir) {
        Some(exe) => exe,
        None => {
            eprintln!("[Tauri Supervisor Error] Aborting backend startup because the embedded Python runtime is missing.");
            return;
        }
    };
    let script_path = match get_run_script(resource_dir) {
        Some(path) => path,
        None => {
            eprintln!("[Tauri Supervisor Error] Aborting backend spawn because 'run_production.py' script was not found.");
            return;
        }
    };

    println!("[Tauri Supervisor] Spawning backend process...");
    println!("[Tauri Supervisor Diagnostics]:");
    println!("  - Resolved Resource Directory: {}", resource_dir.display());
    println!("  - Python Binary: {}", python_exe);
    println!("  - Script Path: {}", script_path);

    let mut cmd = Command::new(&python_exe);
    cmd.arg(&script_path);
    cmd.current_dir(resource_dir);

    // Stream stdout and stderr so diagnostics and failure tracebacks are printed cleanly
    cmd.stdout(Stdio::inherit());
    cmd.stderr(Stdio::inherit());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW = 0x08000000
        cmd.creation_flags(0x08000000);
    }

    match cmd.spawn() {
        Ok(child) => {
            println!("[Tauri Supervisor] Backend process spawned successfully (PID: {}).", child.id());
            let mut guard = child_mutex.lock().unwrap();
            *guard = Some(child);
            start_health_verifier();
        }
        Err(err) => {
            eprintln!("[Tauri Supervisor Error] Failed to spawn backend process with '{} {}': {}", python_exe, script_path, err);
        }
    }
}

fn kill_backend(child_mutex: &Arc<Mutex<Option<Child>>>) {
    let mut guard = child_mutex.lock().unwrap();
    if let Some(mut child) = guard.take() {
        println!("[Tauri Supervisor] Terminating backend process...");
        let _ = child.kill();
        let _ = child.wait();
        println!("[Tauri Supervisor] Backend process terminated cleanly.");
    }
}

fn start_health_verifier() {
    thread::spawn(|| {
        println!("[Tauri Supervisor] Verifying backend health on http://127.0.0.1:8000/api/health (30s timeout)...");
        let start = Instant::now();
        let timeout = Duration::from_secs(30);

        while start.elapsed() < timeout {
            thread::sleep(Duration::from_millis(500));
            if let Ok(mut stream) = TcpStream::connect("127.0.0.1:8000") {
                let request = "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
                if stream.write_all(request.as_bytes()).is_ok() {
                    let mut buffer = [0; 512];
                    if let Ok(bytes_read) = stream.read(&mut buffer) {
                        let response = String::from_utf8_lossy(&buffer[..bytes_read]);
                        if response.contains("200 OK") || response.contains("status") {
                            println!("[Tauri Supervisor] ✅ Backend health check PASSED! FastAPI server is listening and responding (HTTP 200).");
                            return;
                        }
                    }
                }
            }
        }
        eprintln!("[Tauri Supervisor Error] ❌ Backend health check TIMED OUT after 30s! Server failed to respond on port 8000.");
    });
}

fn start_crash_monitor(child_mutex: Arc<Mutex<Option<Child>>>, resource_dir: PathBuf) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(3));
        let is_dead = {
            let mut guard = child_mutex.lock().unwrap();
            if let Some(ref mut child) = *guard {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        eprintln!("[Tauri Supervisor Warning] Backend process exited unexpectedly with status: {}", status);
                        true
                    }
                    Ok(None) => false,
                    Err(e) => {
                        eprintln!("[Tauri Supervisor Error] Error checking backend process status: {}", e);
                        false
                    }
                }
            } else {
                true
            }
        };

        if is_dead {
            println!("[Tauri Supervisor] Auto-restarting crashed backend process...");
            spawn_backend(&child_mutex, &resource_dir);
        }
    });
}

fn main() {
    let child_handle: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let child_handle_setup = Arc::clone(&child_handle);
    let child_handle_close = Arc::clone(&child_handle);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            println!("[Tauri App] Window initialized.");

            let resource_dir = match app.path().resource_dir() {
                Ok(dir) => dir,
                Err(err) => {
                    eprintln!("[Tauri Supervisor Error] Failed to resolve resource directory: {}", err);
                    PathBuf::from(".")
                }
            };
            println!("[Tauri Supervisor] Resolved Resource Directory: {}", resource_dir.display());

            // Spawn backend on application startup using resource directory
            spawn_backend(&child_handle_setup, &resource_dir);

            // Start background crash monitoring thread
            start_crash_monitor(Arc::clone(&child_handle_setup), resource_dir);

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(move |_app_handle, event| match event {
        RunEvent::ExitRequested { .. } | RunEvent::Exit => {
            kill_backend(&child_handle_close);
        }
        _ => {}
    });
}
