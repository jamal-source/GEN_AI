import os

search_dir = r"c:\Users\ACER\Desktop\GEN_AI"

print("Searching for folders starting with 'batch' or containing 'batch' in:", search_dir)
for root, dirs, files in os.walk(search_dir):
    for d in dirs:
        if "batch" in d or "master" in d:
            print("Found directory:", os.path.join(root, d))
