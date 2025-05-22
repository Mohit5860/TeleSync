import pyautogui
import sys

pyautogui.FAILSAFE = False

for line in sys.stdin:
    try:
        parts = line.strip().split(",")

        command = parts[0]

        if command == "move":
            x = float(parts[1])
            y = float(parts[2])
            pyautogui.moveTo(x, y)

        elif command == "click":
            button = parts[1] if len(parts) > 1 else "left"
            pyautogui.click(button=button)

        elif command == "keypress":
            key = parts[1]
            pyautogui.press(key)

        else:
            print(f"Unknown command: {command}")

    except Exception as e:
        print(f"Error: {e}")
