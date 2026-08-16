import os

search_dir = r"C:\Users\ACER"
target_name = "batch_b87313cb"

print(f"Searching for directories containing '{target_name}':")
found = False
for root, dirs, files in os.walk(search_dir):
    if "AppData" in root and "antigravity-ide" not in root:
        continue
    for d in dirs:
        if target_name in d:
            print("Found directory:", os.path.join(root, d))
            found = True
if not found:
    print("No matching directories found.")
