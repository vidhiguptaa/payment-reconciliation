const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const TARGET_DIR = path.join(PROJECT_ROOT, 'src-tauri', 'resources');
const TARGET_PYTHON_DIR = path.join(TARGET_DIR, 'python');
const TARGET_BACKEND_DIR = path.join(TARGET_DIR, 'backend');
const REQUIREMENTS_FILE = path.join(PROJECT_ROOT, 'backend', 'requirements.txt');
const RUN_SCRIPT_SRC = path.join(PROJECT_ROOT, 'run_production.py');
const RUN_SCRIPT_DEST = path.join(TARGET_DIR, 'run_production.py');

function runCmd(cmd, options = {}) {
    console.log(`> ${cmd}`);
    return execSync(cmd, { stdio: 'inherit', ...options });
}

function forceRmSync(dir) {
    if (!fs.existsSync(dir)) return;
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
        console.warn(`fs.rmSync failed for ${dir} (${err.code}). Trying shell fallback...`);
        try {
            if (process.platform === 'win32') {
                execSync(`rmdir /s /q "${dir}"`, { stdio: 'ignore' });
            } else {
                execSync(`rm -rf "${dir}"`, { stdio: 'ignore' });
            }
        } catch (shellErr) {
            console.error(`Shell fallback failed: ${shellErr.message}`);
            throw err;
        }
    }
}

// 1. Detect platform and architecture
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

console.log(`Detected Platform: ${process.platform}, Architecture: ${process.arch}`);

// We require python 3.11.11 as specified in .python-version
const pythonVersion = '3.11.11';

// 2. Ensure uv is installed
try {
    execSync('uv --version', { stdio: 'ignore' });
} catch (e) {
    console.error('Error: "uv" is not installed on this system. Please install uv first.');
    process.exit(1);
}

// 3. Install target Python version via uv
console.log(`Installing Python ${pythonVersion} using uv...`);
runCmd(`uv python install ${pythonVersion}`);

// 4. Find python executable path
const uvFindCmd = `uv python find ${pythonVersion}`;
console.log(`> ${uvFindCmd}`);
const pythonExePath = execSync(uvFindCmd).toString().trim();
console.log(`Found standalone Python executable: ${pythonExePath}`);

// 5. Determine Python standalone root
let pythonRoot;
if (isWindows) {
    pythonRoot = path.dirname(pythonExePath);
} else {
    pythonRoot = path.dirname(path.dirname(pythonExePath));
}
console.log(`Standalone Python Root: ${pythonRoot}`);

// 6. Clean previous target directories
console.log('Cleaning previous embedded environment...');
forceRmSync(TARGET_PYTHON_DIR);
forceRmSync(TARGET_BACKEND_DIR);
fs.rmSync(RUN_SCRIPT_DEST, { force: true });
fs.mkdirSync(TARGET_DIR, { recursive: true });

// 7. Copy Python runtime
console.log('Copying standalone Python runtime...');
fs.cpSync(pythonRoot, TARGET_PYTHON_DIR, { recursive: true });

// Fix any symlinks that Node's fs.cpSync resolved to absolute host paths pointing back to pythonRoot.
// We must rewrite them to be relative to ensure relocatability and proper sys.prefix/sys.path calculation.
function fixSymlinks(dir, baseDir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const lstat = fs.lstatSync(fullPath);
        if (lstat.isSymbolicLink()) {
            const target = fs.readlinkSync(fullPath);
            if (path.isAbsolute(target)) {
                const relativeToRoot = path.relative(pythonRoot, target);
                if (!relativeToRoot.startsWith('..') && !path.isAbsolute(relativeToRoot)) {
                    const newTargetInCopied = path.join(baseDir, relativeToRoot);
                    const symlinkDir = path.dirname(fullPath);
                    const relativeTarget = path.relative(symlinkDir, newTargetInCopied);
                    console.log(`Fixing symlink: ${fullPath} -> ${relativeTarget}`);
                    fs.unlinkSync(fullPath);
                    fs.symlinkSync(relativeTarget, fullPath);
                }
            }
        } else if (lstat.isDirectory()) {
            fixSymlinks(fullPath, baseDir);
        }
    }
}
console.log('Fixing symlinks inside copied Python runtime...');
fixSymlinks(TARGET_PYTHON_DIR, TARGET_PYTHON_DIR);

// Remove EXTERNALLY-MANAGED file if it exists to allow pip installations inside the private copy
const libDir = isWindows ? path.join(TARGET_PYTHON_DIR, 'Lib') : path.join(TARGET_PYTHON_DIR, 'lib');
if (fs.existsSync(libDir)) {
    const pythonDirs = isWindows ? ['.'] : fs.readdirSync(libDir).filter(f => f.startsWith('python'));
    for (const pyDir of pythonDirs) {
        const extManagedPath = path.join(libDir, pyDir, 'EXTERNALLY-MANAGED');
        if (fs.existsSync(extManagedPath)) {
            console.log(`Removing EXTERNALLY-MANAGED file from: ${extManagedPath}`);
            fs.rmSync(extManagedPath);
        }
    }
}

// 8. Copy backend files to target resources for production-like dev layout
console.log('Copying backend source files and entrypoint...');
fs.cpSync(path.join(PROJECT_ROOT, 'backend', 'app'), path.join(TARGET_BACKEND_DIR, 'app'), { recursive: true });
fs.cpSync(path.join(PROJECT_ROOT, 'backend', 'config'), path.join(TARGET_BACKEND_DIR, 'config'), { recursive: true });
fs.copyFileSync(REQUIREMENTS_FILE, path.join(TARGET_BACKEND_DIR, 'requirements.txt'));
fs.copyFileSync(RUN_SCRIPT_SRC, RUN_SCRIPT_DEST);

// 9. Install dependencies using the copied python's pip
console.log('Installing backend dependencies...');
let pipPath;
if (isWindows) {
    pipPath = path.join(TARGET_PYTHON_DIR, 'Scripts', 'pip.exe');
} else {
    pipPath = path.join(TARGET_PYTHON_DIR, 'bin', 'pip3');
}

// Upgrade pip first
runCmd(`"${pipPath}" install --upgrade pip`);
// Install requirements
runCmd(`"${pipPath}" install -r "${REQUIREMENTS_FILE}"`);

// 10. Prune development and non-runtime files
console.log('Pruning non-runtime artifacts to minimize package size...');

function deletePattern(dir, pattern, type = 'file') {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (!fs.existsSync(fullPath)) continue;
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (type === 'dir' && pattern.test(file)) {
                fs.rmSync(fullPath, { recursive: true, force: true });
            } else {
                deletePattern(fullPath, pattern, type);
            }
        } else if (type === 'file' && pattern.test(file)) {
            fs.rmSync(fullPath, { force: true });
        }
    }
}

// 10.1 Delete __pycache__ folders recursively
deletePattern(TARGET_DIR, /^__pycache__$/, 'dir');
// 10.2 Delete .pyc and .pyo files recursively
deletePattern(TARGET_DIR, /\.(pyc|pyo)$/, 'file');

// 10.3 Delete package tests from site-packages
let sitePackagesDir;
if (isWindows) {
    sitePackagesDir = path.join(TARGET_PYTHON_DIR, 'Lib', 'site-packages');
} else {
    const libDir = path.join(TARGET_PYTHON_DIR, 'lib');
    const pythonDirs = fs.readdirSync(libDir).filter(f => f.startsWith('python'));
    if (pythonDirs.length > 0) {
        sitePackagesDir = path.join(libDir, pythonDirs[0], 'site-packages');
    }
}

if (sitePackagesDir && fs.existsSync(sitePackagesDir)) {
    console.log(`Pruning site-packages in: ${sitePackagesDir}`);
    const pkgs = fs.readdirSync(sitePackagesDir);
    for (const pkg of pkgs) {
        const pkgPath = path.join(sitePackagesDir, pkg);
        if (fs.existsSync(pkgPath) && fs.statSync(pkgPath).isDirectory()) {
            const testDir = path.join(pkgPath, 'tests');
            if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
            const testDir2 = path.join(pkgPath, 'test');
            if (fs.existsSync(testDir2)) fs.rmSync(testDir2, { recursive: true, force: true });
        }
    }
    
    // Remove build and package manager packages (pip, setuptools, wheel) to save space
    const toRemove = ['pip', 'setuptools', 'wheel'];
    for (const item of toRemove) {
        fs.rmSync(path.join(sitePackagesDir, item), { recursive: true, force: true });
        const distInfos = fs.readdirSync(sitePackagesDir).filter(f => f.startsWith(`${item}-`) && f.endsWith('.dist-info'));
        for (const distInfo of distInfos) {
            fs.rmSync(path.join(sitePackagesDir, distInfo), { recursive: true, force: true });
        }
    }
}

// 10.4 Remove headers, share, docs if they exist
const extraDirs = ['include', 'share', 'man', 'pkgconfig'];
for (const dir of extraDirs) {
    fs.rmSync(path.join(TARGET_PYTHON_DIR, dir), { recursive: true, force: true });
}

// 11. Verification
console.log('Verifying required Python runtime module imports...');
let pythonBinPath;
if (isWindows) {
    pythonBinPath = path.join(TARGET_PYTHON_DIR, 'python.exe');
} else {
    pythonBinPath = path.join(TARGET_PYTHON_DIR, 'bin', 'python3');
}

runCmd(`"${pythonBinPath}" -c "import fastapi, uvicorn, pydantic, pydantic_settings, PIL, numpy, pandas, openpyxl, sqlalchemy, watchdog"`);

console.log('==================================================');
console.log(' ✅ Standalone Embedded Python runtime prepared & verified!');
console.log(`    Location: ${TARGET_PYTHON_DIR}`);
console.log('==================================================');
