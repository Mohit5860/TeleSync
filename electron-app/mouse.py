# import pyautogui
# import sys

# x = float(sys.argv[1])
# y = float(sys.argv[2])
# x = int(x)
# y = int(y)
# pyautogui.moveTo(x, y)
# print(f"Mouse moved to ({x}, {y})")


import pyautogui
import sys

# Disable the fail-safe feature (moving to the corner of the screen won't stop the script)
pyautogui.FAILSAFE = False

# Keep the server running and listen for coordinates
for line in sys.stdin:
    try:
        # Get coordinates (x, y) passed from Electron
        x_str, y_str = line.strip().split(",")
        x = float(x_str)
        y = float(y_str)
        
        # Move the mouse to the specified coordinates
        pyautogui.moveTo(x, y)
    except Exception as e:
        print(f"Error: {e}")
