# עסק אטומי — Plugin Marketplace

Marketplace אחד לתלמידי "עסק אטומי למתחילים": WhatsApp, ElevenLabs ו-Morning.

התקנה: ב-Codex, באזור ה-Plugins, לוחצים על המשולש הקטן ליד ה-+ ← Add marketplace ← מדביקים:

```
https://github.com/aviz85/atomi-whatsapp
```

ואז מתקינים את התוסף הרצוי. מדריך WhatsApp מלא: https://atomi.biz/wa

חובה: Node 18+ (fetch מובנה, בלי Python ובלי תלויות להתקין).
המפתחות נשמרים ב-`.env` בשורש הפרויקט הנוכחי (נוסף ל-`.gitignore`). התוספים לא כותבים מחוץ לתיקיית הפרויקט.

אחרי הוספת ה-marketplace אפשר להתקין שלושה תוספים מאותה חבילה:
- `whatsapp`
- `elevenlabs`
- `morning`

שלושתם קוראים את אותו `.env` המקומי. אסור להדביק מפתחות בצ'אט.

## עדכון Marketplace שכבר הותקן

```bash
codex plugin marketplace upgrade atomi-whatsapp
codex plugin add morning@atomi-whatsapp
```

לאחר מכן פותחים שיחה חדשה. אם רוצים גם לרענן את גרסת WhatsApp המותקנת:

```bash
codex plugin add whatsapp@atomi-whatsapp
```

מדריך Morning: [MORNING.md](MORNING.md)
