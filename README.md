### `README.md`

````markdown
# TavernRecords XP Bot

A Discord XP and leveling bot built on top of **JTexpo's original code**, updated and maintained by **Ravenwingz**.  
This bot provides a flexible tiered XP/CP system with leveling, role assignment, and customization options.

---

## ✨ Features
- Tiered XP/CP system
- Automatic role assignment when players level up
- Configurable colors, icons, and messages
- Modular command system for easy expansion
- Local SQLite database for persistent storage

---

## 🚀 Setup

1. **Clone or Download this repo**
   ```bash
   git clone https://github.com/Ravenwingz/tavernrecords.git
   cd tavernrecords
````

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   * Copy `.env-EXAMPLE` → `.env`
   * Fill in your details:

     ```env
     DISCORD_TOKEN=your-bot-token
     CLIENT_ID=your-client-id
     DEPLOY_GLOBAL=true
     ```

4. **Configure bot settings**

   * Copy `config-EXAMPLE.json` → `config.json`
   * Update with your Discord IDs, icon URLs, and preferences.

5. **Run the bot**

   ```bash
   node RPXPholder-main/main.js
   ```

---

## 📂 Project Structure

```
tavernrecords/
 ├── RPXPholder-main/        # Core bot code
 │    ├── xpholder/          # Commands, utils, services
 │    ├── .env-EXAMPLE       # Example environment config
 │    └── config-EXAMPLE.json
 ├── guilds/                 # Local database storage
 ├── package.json
 ├── package-lock.json
 ├── README.md
 ├── LICENSE
 └── .gitignore
```

---

## 🙏 Acknowledgements

* Original base code by **JTexpo**
* Updated and maintained by **Ravenwingz**

---

## 🌐 Community & Support
- Join the Discord: [TavernRecords Community](https://discord.gg/cqw4mnpDMG)
- Support development: [Ko-fi – TavernRecords Bot](https://ko-fi.com/tavernrecordsbot)


---

## 📜 License

This project is licensed under the MIT License, with Attribution Notice. See [LICENSE](E:\Downloads\GitHub-tavernrecords\tavernrecords\LICENSE) for details.

You are free to use, modify, and distribute this code.

Attribution is required — credit must be given to:

Ravenwingz (maintainer)
JTexpo (original base code author)


```
