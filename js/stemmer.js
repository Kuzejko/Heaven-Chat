// --- Russian Snowball Stemmer (Support for Russian inflections) ---
export function stemRussian(word) {
  word = word.toLowerCase().replace(/ё/g, "е");
  const RVRE = /^(.*?[аеиоуыэюя])(.*)$/i;
  const match = word.match(RVRE);
  if (!match) return word;
  let pre = match[1];
  let rv = match[2];
  if (!rv) return word;

  const temp = rv.replace(/((?:в|вши|вшись)|(?:ив|ивши|ившись|явши|явшись))$/, "");
  if (temp !== rv) {
    rv = temp;
  } else {
    rv = rv.replace(/(с[яь])$/, "");
    const adj = rv.replace(/(ее|ие|ые|ое|ми|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$/, "");
    if (adj !== rv) {
      rv = adj;
      rv = rv.replace(/((?:ивш|ывш|ующ)|(?:авш|явыш|ящ|ущ|ющ))$/, "");
    } else {
      const verb = rv.replace(/(сила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю)$/, "");
      if (verb !== rv) {
        rv = verb;
      } else {
        rv = rv.replace(/(а|ев|ов|ах|е|и|ия|ья|о|у|ами|ями|ов|ы|ией|ий|ой|ем|ом|ях|ю|ию|ь|ия|ья)$/, "");
      }
    }
  }
  rv = rv.replace(/(ейш|ейше)$/, "");
  rv = rv.replace(/ость$/, "");
  const final = rv.replace(/ь$/, "");
  return pre + final;
}

// --- English Porter Stemmer ---
export function stemEnglish(word) {
  word = word.toLowerCase();
  if (word.length < 3) return word;
  
  if (word.endsWith("sses")) word = word.slice(0, -2);
  else if (word.endsWith("ies")) word = word.slice(0, -3) + "i";
  else if (word.endsWith("ss")) {}
  else if (word.endsWith("s") && !word.endsWith("us") && !word.endsWith("is") && !word.endsWith("as")) word = word.slice(0, -1);
  
  if (word.endsWith("eed")) {
    if (word.slice(0, -3).match(/[aeiou]/)) word = word.slice(0, -1);
  } else if (word.endsWith("ing") || word.endsWith("ed")) {
    const base = word.endsWith("ing") ? word.slice(0, -3) : word.slice(0, -2);
    if (base.match(/[aeiou]/)) {
      word = base;
      if (word.endsWith("at") || word.endsWith("bl") || word.endsWith("iz")) word += "e";
    }
  }
  
  if (word.endsWith("y")) {
    const base = word.slice(0, -1);
    if (base.match(/[aeiou]/)) word = base + "i";
  }
  return word;
}

export function stemWord(word) {
  word = word.trim().toLowerCase();
  if (!word) return "";
  if (/[а-яё]/i.test(word)) return stemRussian(word);
  return stemEnglish(word);
}

// --- Stem & Regex match checker ---
export function checkLoreBookTriggers(historyText, keysString) {
  if (!keysString || !keysString.trim()) return false;
  
  const triggers = keysString.split(",").map(k => k.trim()).filter(Boolean);
  
  for (const trigger of triggers) {
    if ((trigger.startsWith("/") && trigger.endsWith("/")) || trigger.match(/^\/.*\/[gimy]*$/)) {
      try {
        const parts = trigger.split("/");
        const flags = parts.pop();
        const pattern = parts.slice(1).join("/");
        const regex = new RegExp(pattern, flags || "i");
        if (regex.test(historyText)) {
          return true;
        }
      } catch (e) {
        console.error("Invalid regex trigger:", trigger, e);
      }
      continue;
    }
    
    const splitRegex = /[\s,.\/#!$%\^&\*;:{}=\-_`~()?"']+/;
    const cleanWord = t => stemWord(t.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g, ""));
    
    const triggerTokens = trigger.split(splitRegex).map(cleanWord).filter(Boolean);
    if (triggerTokens.length === 0) continue;
    
    const historyTokens = historyText.split(splitRegex).map(cleanWord).filter(Boolean);
    
    for (let i = 0; i <= historyTokens.length - triggerTokens.length; i++) {
      let match = true;
      for (let j = 0; j < triggerTokens.length; j++) {
        if (historyTokens[i + j] !== triggerTokens[j]) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }
  }
  
  return false;
}
