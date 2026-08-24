# חיבור Morning ל-Codex / ChatGPT Desktop

Morning נמצא באותו Marketplace של WhatsApp ו-ElevenLabs. אין צורך להוסיף Marketplace נוסף ואין צורך ב-MCP.

## התקנה חדשה

ב-Plugins מוסיפים פעם אחת את ה-Marketplace:

```text
https://github.com/aviz85/atomi-whatsapp
```

מתקינים את `morning`, פותחים שיחה חדשה וכותבים: **חבר לי את Morning**.

## אם ה-Marketplace כבר מותקן

בטרמינל של Codex מריצים:

```bash
codex plugin marketplace upgrade atomi-whatsapp
codex plugin add morning@atomi-whatsapp
```

לאחר מכן פותחים שיחה חדשה. אם רוצים לרענן גם את גרסת WhatsApp:

```bash
codex plugin add whatsapp@atomi-whatsapp
```

## חיבור המפתחות

1. ב-Morning נכנסים אל Settings → Developer Tools → API Keys ויוצרים Key + Secret.
2. אומרים ל-Codex: **חבר לי את Morning**.
3. הפלאגין ייצור או ירחיב את `.env` בשורש הפרויקט ויפתח אותו בעורך.
4. ממלאים ושומרים:

```dotenv
MORNING_API_KEY=
MORNING_API_SECRET=
```

5. חוזרים לצ'אט וכותבים **סיימתי**. Codex יבצע בדיקת OAuth לקריאה בלבד.

לא מדביקים מפתחות בצ'אט. `.env` נוסף אוטומטית ל-`.gitignore`. טוקן ה-OAuth הזמני נשמר בזיכרון בלבד.

## הדגמה בטוחה ראשונה

בקשו: **חפש ב-Morning לקוח בשם …** או **הצג לי את הלינקים הפעילים לתשלום**. אלה פעולות קריאה בלבד.

להפקת חשבונית משתמשים תמיד בתהליך תצוגה מקדימה → בדיקת PDF → אישור מפורש → הפקה. הפלאגין מסרב להפיק בלי טוקן תצוגה מקדימה תקף ובלי דגל אישור מפורש.
