#!/usr/bin/env bash
set -e

echo "=================================================="
echo " Preparing Embedded Python Production Runtime..."
echo "=================================================="

# Determine directory paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_PYTHON_DIR="$PROJECT_ROOT/src-tauri/resources/python"
REQUIREMENTS_FILE="$PROJECT_ROOT/backend/requirements.txt"

echo "[1/5] Cleaning previous embedded runtime directory..."
rm -rf "$TARGET_PYTHON_DIR"
mkdir -p "$PROJECT_ROOT/src-tauri/resources"

echo "[2/5] Creating clean isolated Python runtime..."
# Use --copies to ensure binaries and dynamic libraries are copied rather than symlinked
python3 -m venv --copies "$TARGET_PYTHON_DIR"

echo "[3/5] Installing backend dependencies from requirements.txt..."
if [ -f "$TARGET_PYTHON_DIR/bin/pip" ]; then
    PIP_BIN="$TARGET_PYTHON_DIR/bin/pip"
elif [ -f "$TARGET_PYTHON_DIR/Scripts/pip.exe" ]; then
    PIP_BIN="$TARGET_PYTHON_DIR/Scripts/pip.exe"
else
    echo "❌ Error: Could not locate pip binary in $TARGET_PYTHON_DIR"
    exit 1
fi

"$PIP_BIN" install --upgrade pip
"$PIP_BIN" install -r "$REQUIREMENTS_FILE"

echo "[4/5] Pruning development files and non-runtime artifacts..."

# Calculate stats before pruning
BEFORE_FILES=$(find "$TARGET_PYTHON_DIR" -type f | wc -l | tr -d ' ')
BEFORE_SIZE=$(du -sh "$TARGET_PYTHON_DIR" | cut -f1)

# Count individual items for reporting before deletion
TESTS_COUNT=$(find "$TARGET_PYTHON_DIR" -type d \( -name "tests" -o -name "test" \) -exec find {} -type f \; | wc -l | tr -d ' ')
PIP_COUNT=$(find "$TARGET_PYTHON_DIR"/lib/python*/site-packages/pip "$TARGET_PYTHON_DIR"/lib/python*/site-packages/pip-*.dist-info -type f 2>/dev/null | wc -l | tr -d ' ')
SETUPTOOLS_COUNT=$(find "$TARGET_PYTHON_DIR"/lib/python*/site-packages/setuptools "$TARGET_PYTHON_DIR"/lib/python*/site-packages/setuptools-*.dist-info -type f 2>/dev/null | wc -l | tr -d ' ')
WHEEL_COUNT=$(find "$TARGET_PYTHON_DIR"/lib/python*/site-packages/wheel "$TARGET_PYTHON_DIR"/lib/python*/site-packages/wheel-*.dist-info -type f 2>/dev/null | wc -l | tr -d ' ')

echo "  - Before Pruning: $BEFORE_FILES files ($BEFORE_SIZE)"

# 1. Remove __pycache__, *.pyc, *.pyo
find "$TARGET_PYTHON_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$TARGET_PYTHON_DIR" -type f \( -name "*.pyc" -o -name "*.pyo" \) -delete 2>/dev/null || true

# 2. Remove package test directories (site-packages/*/tests, site-packages/*/test)
find "$TARGET_PYTHON_DIR"/lib/python*/site-packages -type d \( -name "tests" -o -name "test" \) -exec rm -rf {} + 2>/dev/null || true

# 3. Remove build & package manager packages (pip, setuptools, wheel)
rm -rf "$TARGET_PYTHON_DIR"/lib/python*/site-packages/pip "$TARGET_PYTHON_DIR"/lib/python*/site-packages/pip-*.dist-info
rm -rf "$TARGET_PYTHON_DIR"/lib/python*/site-packages/setuptools "$TARGET_PYTHON_DIR"/lib/python*/site-packages/setuptools-*.dist-info
rm -rf "$TARGET_PYTHON_DIR"/lib/python*/site-packages/wheel "$TARGET_PYTHON_DIR"/lib/python*/site-packages/wheel-*.dist-info

# 4. Remove headers, docs, manual pages, pkgconfig
rm -rf "$TARGET_PYTHON_DIR/include"
rm -rf "$TARGET_PYTHON_DIR/share"
rm -rf "$TARGET_PYTHON_DIR/man"
rm -rf "$TARGET_PYTHON_DIR/pkgconfig"

# Calculate stats after pruning
AFTER_FILES=$(find "$TARGET_PYTHON_DIR" -type f | wc -l | tr -d ' ')
AFTER_SIZE=$(du -sh "$TARGET_PYTHON_DIR" | cut -f1)

# Calculate percentage reduction
REDUCTION_PERCENT=$(( (BEFORE_FILES - AFTER_FILES) * 100 / BEFORE_FILES ))

echo "  - After Pruning:  $AFTER_FILES files ($AFTER_SIZE)"
echo "  - Reduction:      $REDUCTION_PERCENT% fewer files ($((BEFORE_FILES - AFTER_FILES)) files removed)"

# Verify python binary existence
if [ -f "$TARGET_PYTHON_DIR/bin/python3" ]; then
    PYTHON_BIN="$TARGET_PYTHON_DIR/bin/python3"
elif [ -f "$TARGET_PYTHON_DIR/Scripts/python.exe" ]; then
    PYTHON_BIN="$TARGET_PYTHON_DIR/Scripts/python.exe"
else
    echo "❌ Error: Python binary missing after pruning!"
    exit 1
fi

echo "[5/5] Verifying required Python runtime module imports..."
"$PYTHON_BIN" -c "import fastapi"
"$PYTHON_BIN" -c "import uvicorn"
"$PYTHON_BIN" -c "import pydantic"
"$PYTHON_BIN" -c "import pydantic_settings"
"$PYTHON_BIN" -c "import PIL"
"$PYTHON_BIN" -c "import numpy"

echo "=================================================="
echo " ✅ Embedded Python runtime prepared & verified!"
echo "    Location:      $TARGET_PYTHON_DIR"
echo "    Files Before:  $BEFORE_FILES ($BEFORE_SIZE)"
echo "    Files After:   $AFTER_FILES ($AFTER_SIZE)"
echo "    Reduction:     $REDUCTION_PERCENT%"
echo "=================================================="
