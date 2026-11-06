import keyboard
import pyperclip
import requests
import threading
import time
import tkinter as tk

# Global Variables
typed_buffer = ""
suggestions = []
is_processing = False
display_text = "🟢 Kannada System Tool Active. Start typing..."

# --- 1. Background Network Fetching ---
def fetch_suggestions(word):
    global suggestions, display_text
    if not word.strip():
        suggestions = []
        display_text = "🟢 Start typing..."
        return
    try:
        # Call the exact same Google API used in your web project
        url = f"https://inputtools.google.com/request?text={word}&itc=kn-t-i0-und&num=5"
        res = requests.get(url, timeout=2)
        data = res.json()
        
        if data[0] == 'SUCCESS':
            suggestions = data[1][0][1]
            # Format the suggestions for the floating UI (e.g., 1:ನನ್ನ 2:ನಾನ)
            sug_string = "   ".join([f"{i+1}: {s}" for i, s in enumerate(suggestions)])
            display_text = f" {word}  ➜  {sug_string} "
    except Exception:
        display_text = " ⚠️ Network error fetching suggestions..."

# --- 2. Safe Text Replacement ---
def replace_text(word_to_paste, english_length, spacing_char):
    global is_processing
    keyboard.unhook_all()
    
    old_clipboard = pyperclip.paste()
    pyperclip.copy(word_to_paste)
    
    # Delete English word
    for _ in range(english_length + 1 if spacing_char else english_length):
        keyboard.send('backspace')
    
    time.sleep(0.05)
    keyboard.send('ctrl+v') # Paste Kannada
    time.sleep(0.05)
    
    # Add space/enter if triggered by that key
    if spacing_char:
        keyboard.send(spacing_char)
        
    time.sleep(0.05)
    pyperclip.copy(old_clipboard) # Restore clipboard
    
    keyboard.hook(on_key_event)
    is_processing = False

# --- 3. Keyboard Interception ---
def on_key_event(event):
    global typed_buffer, is_processing, suggestions, display_text
    
    if is_processing: return
        
    if event.event_type == keyboard.KEY_DOWN:
        # Auto-complete the top suggestion on Space or Enter
        if event.name in ['space', 'enter']:
            if typed_buffer.strip() and suggestions:
                is_processing = True
                word_to_paste = suggestions[0]
                spacing = 'space' if event.name == 'space' else 'enter'
                
                eng_len = len(typed_buffer)
                typed_buffer = ""
                suggestions = []
                display_text = "🟢 Start typing..."
                
                threading.Thread(target=replace_text, args=(word_to_paste, eng_len, spacing)).start()
                return

        # Select a specific suggestion using numbers 1-5
        elif event.name in ['1', '2', '3', '4', '5'] and typed_buffer.strip() and suggestions:
            idx = int(event.name) - 1
            if idx < len(suggestions):
                is_processing = True
                word_to_paste = suggestions[idx]
                
                eng_len = len(typed_buffer)
                typed_buffer = ""
                suggestions = []
                display_text = "🟢 Start typing..."
                
                # We don't pass a spacing char here so you can type punctuation right after
                threading.Thread(target=replace_text, args=(word_to_paste, eng_len, None)).start()
                return

        # Handle backspace
        elif event.name == 'backspace':
            typed_buffer = typed_buffer[:-1] if typed_buffer else ""
            threading.Thread(target=fetch_suggestions, args=(typed_buffer,)).start()
            
        # Track alphabetical typing
        elif len(event.name) == 1 and event.name.isascii() and event.name.isalpha():
            typed_buffer += event.name
            threading.Thread(target=fetch_suggestions, args=(typed_buffer,)).start()
            
        # Clear memory if you click away or use arrows
        elif event.name in ['up', 'down', 'left', 'right', 'esc', 'tab']:
            typed_buffer = ""
            suggestions = []
            display_text = "🟢 Start typing..."

# --- 4. Floating GUI Setup ---
root = tk.Tk()
root.title("Kannada IME")
root.attributes("-topmost", True) # Keeps the bar always visible above Notepad/Chrome
root.overrideredirect(True) # Hides standard Windows borders
root.geometry("+20+20") # Positions it in the top-left corner of your screen
root.configure(bg='#1e1e1e')

# The label that displays the suggestions
label = tk.Label(root, text=display_text, font=("Segoe UI", 12, "bold"), fg="#ffffff", bg="#1e1e1e", padx=15, pady=8)
label.pack()

# Thread-safe UI update loop
def update_ui():
    label.config(text=display_text)
    root.after(50, update_ui) # Refresh the text every 50 milliseconds

# Start keyboard listener
keyboard.hook(on_key_event)

# Start the UI loop
update_ui()
root.mainloop()