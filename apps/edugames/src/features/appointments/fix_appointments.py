import os

file_path = r'd:\Academic_Works\EduAI_Suite\apps\edugames\src\features\appointments\AppointmentBookingPage.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add get_user helper logic
import_replacement = 'import { GlassCard } from "../../shared/components/GlassCard";\n\nconst get_user = () => {\n  const storedUser = localStorage.getItem("user");\n  return storedUser ? JSON.parse(storedUser) : null;\n};'
content = content.replace('import { GlassCard } from "../../shared/components/GlassCard";', import_replacement)

# Replace constant
content = content.replace('const CURRENT_STUDENT = "Aarav S.";', 'const CURRENT_STUDENT = get_user()?.name || "Student";')

# Replace email
content = content.replace('student_email: "aarav.s@christuniversity.in",', 'student_email: get_user()?.sub || "student@christuniversity.in",')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("AppointmentBookingPage fix complete.")
