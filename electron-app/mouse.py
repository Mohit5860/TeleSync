import pyautogui
import sys

# Disable the fail-safe feature
pyautogui.FAILSAFE = False

# Keep the server running and listen for commands
for line in sys.stdin:
    try:
        # Parse the incoming command
        parts = line.strip().split(",")

        command = parts[0]

        if command == "move":
            # Move the mouse to (x, y)
            x = float(parts[1])
            y = float(parts[2])
            pyautogui.moveTo(x, y)

        elif command == "click":
            # Perform a mouse click
            button = parts[1] if len(parts) > 1 else "left"  # Default to left click
            pyautogui.click(button=button)

        elif command == "keypress":
            # Press a key
            key = parts[1]
            pyautogui.press(key)

        elif command == "type":
            # Type a full string
            text = ",".join(parts[1:])  # In case the text itself has commas
            pyautogui.typewrite(text)

        else:
            print(f"Unknown command: {command}")

    except Exception as e:
        print(f"Error: {e}")
