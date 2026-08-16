import os

search_dir = r"C:\Users\ACER"
target_file_name = "singkong_coklat_lumer"

print(f"Searching for files containing '{target_file_name}' in: {search_dir}")
found = False
for root, dirs, files in os.walk(search_dir):
    # Skip AppData or other very deep system folders to avoid infinite loops, but check gemini config
    if "AppData" in root and "antigravity-ide" not in root:
        continue
    for f in files:
        if target_file_name in f:
            print("Found file:", os.path.join(root, f))
            found = True
if not found:
    print("No matching files found anywhere.")
