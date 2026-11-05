import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createEditor, Transforms, Text, Range, Editor } from 'slate';
import { Slate, Editable, withReact, ReactEditor } from 'slate-react';

const App = () => {
  const editor = useMemo(() => withReact(createEditor()), []);
  
  const [target, setTarget] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [dictionary, setDictionary] = useState(new Set());
  const [isDictionaryLoaded, setIsDictionaryLoaded] = useState(false);
  
  const suggestionRef = useRef(null);

  const initialValue = [
    {
      type: 'paragraph',
      children: [{ text: '' }],
    },
  ];

  // 1. Load the massive JSON dictionary on startup
  useEffect(() => {
    fetch('/kannada_dictionary.json')
      .then(response => {
        if (!response.ok) throw new Error("Could not find file in public/ folder");
        return response.json();
      })
      .then(data => {
        setDictionary(new Set(data));
        setIsDictionaryLoaded(true);
      })
      .catch(error => {
        console.error("Dictionary Load Error:", error);
        alert("Dictionary failed to load! Make sure kannada_dictionary.json is in the public/ folder.");
      });
  }, []);

  // 2. Fetch suggestions from Google Input Tools API
  const fetchSuggestions = async (word) => {
    if (!word) return [];
    try {
      const res = await fetch(`https://inputtools.google.com/request?text=${word}&itc=kn-t-i0-und&num=5`);
      const data = await res.json();
      if (data[0] === 'SUCCESS') return data[1][0][1];
      return [];
    } catch (error) {
      console.error("Error fetching suggestions:", error);
      return [];
    }
  };

  // 3. Track cursor and text changes to show the suggestion popup
  const handleChange = () => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [start] = Range.edges(selection);
      const wordBefore = Editor.before(editor, start, { unit: 'word' });
      const beforeRange = wordBefore && Editor.range(editor, wordBefore, start);
      const beforeText = beforeRange && Editor.string(editor, beforeRange);

      // If typing English, fetch Kannada suggestions
      if (beforeText && /^[a-zA-Z]+$/.test(beforeText)) {
        setTarget(beforeRange);
        fetchSuggestions(beforeText).then(setSuggestions);
        return;
      }
    }
    setTarget(null);
  };

  // 4. Insert the selected suggestion
  const insertSuggestion = (suggestion) => {
    if (target) {
      Transforms.select(editor, target);
      Transforms.insertText(editor, suggestion + ' ');
      setTarget(null);
      setSuggestions([]);
    }
  };

  const handleKeyDown = useCallback((event) => {
    if (target && suggestions.length > 0) {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        insertSuggestion(suggestions[0]);
      }
    }
  }, [target, suggestions, editor]);

  // 5. Add custom dialect words dynamically
  const addToDictionary = (word) => {
    setDictionary(prev => {
      const newDict = new Set(prev);
      newDict.add(word);
      return newDict;
    });
    console.log(`Added "${word}" to custom dictionary.`);
  };

  // 6. Spell Checker Logic
  const decorate = useCallback(([node, path]) => {
    const ranges = [];
    if (Text.isText(node)) {
      const text = node.text;
      
      // Split strictly by spaces to preserve exact offset positioning
      const tokens = text.split(/(\s+)/); 
      let offset = 0;
      
      tokens.forEach(token => {
        if (token.trim().length > 0) {
          // Clean the word: remove invisible zero-width characters and punctuation
          const cleanWord = token
            .replace(/[\u200B-\u200D\uFEFF]/g, '') 
            .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "") 
            .trim();
          
          const isKannada = /[\u0C80-\u0CFF]/.test(cleanWord);
          
          // Apply red underline if Kannada, dictionary is loaded, and clean word is not found
          if (isKannada && isDictionaryLoaded && !dictionary.has(cleanWord)) {
            ranges.push({
              anchor: { path, offset },
              focus: { path, offset: offset + token.length },
              misspelled: true,
              cleanWord: cleanWord // Pass the clean word to the Leaf for the "add to dictionary" feature
            });
          }
        }
        offset += token.length;
      });
    }
    return ranges;
  }, [dictionary, isDictionaryLoaded]);

  // 7. Render styled words (Red underline + Click to Add)
  const Leaf = ({ attributes, children, leaf }) => {
    if (leaf.misspelled) {
      return (
        <span 
          {...attributes} 
          onClick={() => {
            if (window.confirm(`"${leaf.cleanWord}" is not in the dictionary. Add it?`)) {
              addToDictionary(leaf.cleanWord);
            }
          }}
          style={{ 
            textDecoration: 'underline wavy red', 
            textUnderlineOffset: '3px', 
            cursor: 'pointer' 
          }}
          title="Click to add to dictionary"
        >
          {children}
        </span>
      );
    }
    return <span {...attributes}>{children}</span>;
  };

  // 8. Position the floating suggestion box directly under the text cursor
  useEffect(() => {
    if (target && suggestions.length > 0 && suggestionRef.current) {
      const domRange = ReactEditor.toDOMRange(editor, target);
      const rect = domRange.getBoundingClientRect();
      suggestionRef.current.style.top = `${rect.bottom + window.scrollY + 5}px`;
      suggestionRef.current.style.left = `${rect.left + window.scrollX}px`;
    }
  }, [suggestions.length, target, editor]);

  return (
    <div style={{ maxWidth: '800px', margin: '50px auto', fontFamily: 'sans-serif' }}>
      <h2>AI Kannada Editor</h2>
      <p style={{ color: 'gray' }}>Type English phonetics (e.g., 'nanna hesaru'). Press Space to auto-complete. Click red words to add them.</p>
      
      {!isDictionaryLoaded && <p style={{ color: 'orange', fontWeight: 'bold' }}>Loading Kannada dictionary...</p>}

      <div style={{ border: '1px solid #ccc', padding: '20px', minHeight: '200px', fontSize: '20px', position: 'relative' }}>
        <Slate editor={editor} initialValue={initialValue} onChange={handleChange}>
          <Editable 
            spellCheck={false} 
            onKeyDown={handleKeyDown}
            renderLeaf={(props) => <Leaf {...props} />}
            decorate={decorate}
            placeholder="Start typing in English..."
          />
        </Slate>
      </div>

      {/* Floating Suggestions Menu */}
      {target && suggestions.length > 0 && (
        <div 
          ref={suggestionRef} 
          style={{ 
            position: 'absolute', 
            zIndex: 1, 
            backgroundColor: 'white', 
            border: '1px solid #ddd', 
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)', 
            borderRadius: '4px', 
            padding: '5px 0', 
            minWidth: '150px' 
          }}
        >
          {suggestions.map((sug, i) => (
            <div 
              key={i} 
              onMouseDown={(e) => { e.preventDefault(); insertSuggestion(sug); }} 
              style={{ 
                padding: '8px 15px', 
                cursor: 'pointer', 
                backgroundColor: i === 0 ? '#f0f0f0' : 'transparent', 
                borderBottom: '1px solid #f5f5f5' 
              }}
            >
              {sug}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default App;