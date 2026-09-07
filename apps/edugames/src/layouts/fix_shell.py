import os

file_path = r'd:\Academic_Works\EduAI_Suite\apps\edugames\src\layouts\StudentShell.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'Aarav S.' in line:
        lines[i] = line.replace('Aarav S.', '{user?.name || "Student"}')
    if 'aarav.s@christuniversity.in' in line:
        lines[i] = line.replace('aarav.s@christuniversity.in', '{user?.sub || "student@christuniversity.in"}')

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Replacement complete.")
