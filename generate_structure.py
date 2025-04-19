import os
import sys

# 定义需要忽略的目录和文件模式
# 你可以根据需要添加或修改这个列表
IGNORE_PATTERNS = {
    # 目录
    ".git",
    ".vscode",
    "node_modules",
    "__pycache__",
    "dist",
    "build",
    "venv",
    ".venv",
    "env",
    ".env",
    "target",
    "out",
    "bin",
    "obj",
    # 文件
    ".DS_Store",
    "*.pyc",
    "*.log",
    "*.tmp",
    "*.swp",
    "*.swo",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "poetry.lock",
    "project_structure.txt", # 忽略脚本自身生成的文件
}

def should_ignore(name):
    """检查文件或目录名是否应该被忽略"""
    if name.startswith('.'):
        return True
    if name in IGNORE_PATTERNS:
        return True
    # 检查文件后缀等模式
    for pattern in IGNORE_PATTERNS:
        if pattern.startswith("*.") and name.endswith(pattern[1:]):
            return True
    return False

def generate_tree(dir_path, output_file, prefix=""):
    """递归生成目录结构树"""
    try:
        # 获取目录下所有条目，并排序
        entries = sorted(os.listdir(dir_path))
    except OSError as e:
        print(f"错误: 无法访问目录 {dir_path}: {e}", file=sys.stderr)
        return

    filtered_entries = [entry for entry in entries if not should_ignore(entry)]
    pointers = ["├── " for _ in range(len(filtered_entries) - 1)] + ["└── "]

    for i, entry in enumerate(filtered_entries):
        pointer = pointers[i]
        entry_path = os.path.join(dir_path, entry)
        output_file.write(prefix + pointer + entry + "\n")

        if os.path.isdir(entry_path):
            extension = "│   " if i < len(filtered_entries) - 1 else "    "
            generate_tree(entry_path, output_file, prefix + extension)

def main():
    """主函数，执行脚本逻辑"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_filename = "project_structure.txt"
    output_filepath = os.path.join(script_dir, output_filename)

    try:
        with open(output_filepath, "w", encoding="utf-8") as f:
            f.write(f"{os.path.basename(script_dir)}/\n") # 写入根目录
            generate_tree(script_dir, f)
        print(f"项目结构已成功生成到: {output_filepath}")
    except IOError as e:
        print(f"错误: 无法写入文件 {output_filepath}: {e}", file=sys.stderr)
    except Exception as e:
        print(f"发生未知错误: {e}", file=sys.stderr)

if __name__ == "__main__":
    main() 