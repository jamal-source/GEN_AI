import os
import datetime

output_dir = r"c:\Users\ACER\Desktop\GEN_AI\product-content-engine\output"
print(f"Listing directories in {output_dir}:")
if os.path.exists(output_dir):
    for entry in os.scandir(output_dir):
        if entry.is_dir():
            mtime = datetime.datetime.fromtimestamp(entry.stat().st_mtime)
            print(f"  Folder: {entry.name} | Modified: {mtime}")
else:
    print("Output directory does not exist!")
