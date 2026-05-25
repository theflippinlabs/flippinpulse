# Pulse Engine — Manuel complet / Full Manual

`<...>` = obligatoire / required · `[...]` = optionnel / optional · 🔒 = Admin uniquement / Administrator only

> 💡 Le plus simple côté admin : tape **`/panel`**. Presque tout se règle depuis ce menu, sans retenir les commandes.

---
---

# 🇫🇷 MANUEL (Français)

## 1. Qu'est-ce que Pulse Engine ?

Pulse Engine est un bot communautaire « tout-en-un » pour ton serveur Discord. Il tourne **tout seul, 24h/24**, et gère :

- **💰 Une économie de points (PULSE)** : les membres gagnent des PULSE automatiquement en étant actifs (messages, réactions, minutes en vocal).
- **🏆 Des rangs** qui montent avec l'activité, avec annonces.
- **🎮 Une dizaine de jeux** (solo, duel et multijoueur) où l'on mise et gagne des PULSE.
- **🛒 Une boutique** où dépenser ses PULSE (rôles, perks, tickets…).
- **🎰 Une loterie** automatique avec jackpot et tirages.
- **🧠 Des quiz communautaires** générés et lancés automatiquement par l'IA.
- **🤖 Pulsar**, un animateur (community manager) IA qui fait vivre le serveur.
- **🎯 Des missions** (défis) lancées automatiquement ou à la demande.
- **🛡️ De la modération** manuelle et automatique (anti-spam, anti-raid…).
- **👋 Des messages de bienvenue** et des annonces.

Tout se pilote depuis le **panneau admin `/panel`**.

> ⚙️ **Fonctions IA** (Pulsar, quiz auto, énigmes) : elles nécessitent une clé `ANTHROPIC_API_KEY` configurée dans Railway. Sans clé, le reste du bot fonctionne normalement.

---

## 2. Commandes pour les membres

### 💰 Économie & profil
| Commande | Description |
|---|---|
| `/balance` | Voir ton solde de PULSE |
| `/profile [user]` | Ton profil (ou celui d'un membre) : points, rang, PULSE |
| `/leaderboard` | Classement des meilleurs |
| `/daily` | Réclamer ta récompense quotidienne (avec bonus de série 🔥) |
| `/missions` | Voir les missions actives |
| `/shop [catégorie]` | Parcourir la boutique |
| `/buy <objet>` | Acheter un objet |

> Tu gagnes des PULSE **automatiquement** : messages, réactions, minutes en vocal.

### 🎮 Jeux solo
| Commande | Description |
|---|---|
| `/higherlower <mise>` | Plus ou Moins — encaisse avant de te tromper |
| `/crash <mise>` | Encaisse avant que le multiplicateur s'effondre |
| `/slots <mise>` | Machine à sous |
| `/roulette <mise> ...` | Roulette européenne |
| `/blackjack <mise>` | Blackjack contre le croupier |
| `/wheel <mise>` | Roue gacha — gros multiplicateurs possibles |
| `/quiz [difficulté]` | Quiz solo pour gagner des PULSE |

### ⚔️ Jeux de duel & multijoueur
| Commande | Description |
|---|---|
| `/duel <joueur> <mise>` | Défie un joueur |
| `/rps <joueur> <mise>` | Pierre-feuille-ciseaux |
| `/typingrace [mise]` | Course de frappe (plusieurs joueurs) |
| `/battleroyale [mise]` | Battle Royale — le dernier survivant rafle la cagnotte |
| `/diceroyale [mise]` | Dé Royale — le plus haut score gagne |

> **Lobby multijoueur** (`/battleroyale`, `/diceroyale`) : clique **🙋 Rejoindre**. Seul l'hôte peut **▶️ Start** (min. 2 joueurs) ou **✖️ Annuler** (rembourse tout le monde). Aucune limite de temps ni de joueurs. La Battle Royale se déroule message par message, façon commentaire de match.

### 🎰 Loterie
| Commande | Description |
|---|---|
| `/lottery status` | Voir le jackpot, tes tickets et l'heure du tirage |
| `/lottery buy <tickets>` | Acheter des tickets |

> Le tirage est automatique. Plus tu as de tickets, plus tu as de chances. Pulsar/le bot rappelle le jackpot dans la journée.

### 🧠 Quiz communautaire
Les quiz sont lancés **automatiquement** (voir réglages admin). Quand un quiz démarre, tout le monde répond avec des boutons et gagne des PULSE par bonne réponse. Une question bonus peut valoir double.

---

## 3. 🤖 Pulsar — l'animateur IA

Pulsar est un « community manager » alimenté par l'IA. Quand il est activé, il :

- **Anime le salon** : il poste régulièrement des questions, des brise-glaces et des messages d'ambiance — **même quand c'est calme**, pour relancer la discussion.
- **Prend des nouvelles** : il tague de temps en temps un membre actif récemment pour lui demander comment ça va.
- **Répond** quand on le mentionne ou qu'on répond à un de ses messages.
- **Accueille les nouveaux** : message de bienvenue personnalisé (sinon, l'embed de bienvenue classique).
- **Présente les événements** : il rédige les annonces de quiz et de loterie dans son style.
- **Récap quotidien** : un résumé de la journée avec des shout-outs.
- **Félicite** les montées de rang et les paliers de membres.
- **Lance des missions** (voir section suivante).

> Pulsar ne tague **jamais** @everyone ni les rôles, et n'invente pas d'infos (prix, promesses…).

**Activer Pulsar** : `/panel → Pulsar` → choisis le salon → **Turn ON**. Boutons disponibles : langue/fréquence (Settings), Tag members, Replies, Welcomes, Host events, Daily recap, Celebrate, et **Post now** pour tester.

---

## 4. 🎯 Missions (défis)

Pulsar peut lancer des missions, **automatiquement** (toutes les ~6h, réglable) **et** à la demande depuis `/panel → Missions`.

| Type | Comment ça marche |
|---|---|
| ⚡ **Défi express** | Les premiers à cliquer **Claim** gagnent des PULSE (ex : les 3 premiers → 50 PULSE, 30 min) |
| 🧩 **Énigme** | Pulsar pose une énigme (IA) ; le 1er qui trouve la bonne réponse (via bouton) gagne |
| 📅 **Objectif du jour** | But auto-suivi (ex : envoyer 20 messages) → PULSE crédité automatiquement |
| 🗓️ **Objectif de la semaine** | Idem, sur la semaine, plus grosse récompense (ex : jouer à 5 jeux) |

**Objectifs auto-suivis** disponibles : envoyer des messages, ajouter des réactions, gagner des quiz, acheter des tickets de loterie, **jouer à des jeux**. Le PULSE est crédité dès l'objectif atteint.

**Côté admin** (`/panel → Missions`) : boutons **Flash challenge**, **Riddle**, **Daily objective**, **Weekly objective**, plus **List active**, **End all** et **Auto-launch ON/OFF**.

---

## 5. 🛠️ Administration — le panneau `/panel`

Tape **`/panel`** (réservé aux admins). Un menu déroulant donne accès à toutes les sections :

| Section | Ce qu'on y règle |
|---|---|
| 🏠 **Home** | Vue d'ensemble + raccourcis |
| ⚙️ **Modules** | Activer/désactiver : bienvenue, rank-up, automod, Pulse Hour, plafond quotidien, série, decay |
| #️⃣ **Channels** | Salons : bienvenue, rank-up, logs de modération, quiz auto |
| 🧠 **Auto-quiz** | On/off, horaires, sujets, nombre de questions, récompense, bonus, **annonce @everyone** |
| 💰 **Economy** | PULSE par point, points par message/réaction/minute vocale |
| 🎁 **Give / remove PULSE** | Choisir un membre → Donner / Retirer / Fixer le solde |
| 🛒 **Shop** | Ajouter / Lister / Masquer / Changer le prix d'un article |
| 🤖 **Pulsar** | Salon, on/off, langue, fréquence, et toutes ses missions (welcomes, events, recap, celebrate) |
| 🎯 **Missions** | Lancer des missions et activer le mode auto |

> Le panneau couvre l'essentiel. Les commandes ci-dessous restent disponibles pour un réglage fin.

### 💰 Gérer les PULSE
| Commande | Description |
|---|---|
| 🔒 `/givepulse <user> <montant> [raison]` | Donner des PULSE |
| 🔒 `/removepulse <user> <montant> [raison]` | Retirer des PULSE |
| 🔒 `/setpulse <user> <montant> [raison]` | Fixer un solde exact |
| 🔒 `/pulseinfo <user>` | Stats éco d'un membre |

### ⚙️ Réglages généraux
| Commande | Description |
|---|---|
| 🔒 `/module <fonction> <on/off>` | welcome, rankup, automod, pulsehour, dailycap, streak, decay |
| 🔒 `/seteconomy <réglage> <valeur>` | PULSE/point, points par message/réaction/vocal/invitation/événement |
| 🔒 `/shopadmin add\|remove\|setprice\|toggle\|list` | Gérer la boutique |

### 👋 Messages & annonces
| Commande | Description |
|---|---|
| 🔒 `/welcome channel\|title\|message\|color\|options\|toggle\|test\|status` | Message de bienvenue |
| 🔒 `/rankup channel\|toggle\|pinguser\|status` | Annonces de montée de rang |
| 🔒 `/modlog channel\|clear\|status` | Salon des logs de modération |

> Variables de texte (welcome) : `{username}`, `{mention}`, `{server}`, `{member_count}`.

### 🧠 Quiz communautaire automatique
| Commande | Description |
|---|---|
| 🔒 `/quizadmin add` | Ajouter une question (question, bonne/mauvaises réponses, catégorie) |
| 🔒 `/quizadmin generate <sujet> <nombre>` | Générer des questions avec l'IA |
| 🔒 `/quizadmin list [catégorie]` | Lister les questions |
| 🔒 `/quizadmin remove <contient>` | Supprimer une question |
| 🔒 `/autoquiz channel\|interval\|times\|topics\|settings\|toggle\|now\|status` | Tout le réglage des quiz auto |

### 🔨 Modération
| Commande | Description |
|---|---|
| 🔒 `/ban <user> [raison] [jours]` | Bannir |
| 🔒 `/unban <id>` | Débannir par ID |
| 🔒 `/kick <user> [raison]` | Expulser |
| 🔒 `/mute <user> [durée] [raison]` | Rendre muet (timeout) |
| 🔒 `/unmute <user>` | Lever le mute |
| 🔒 `/warn <user> [raison]` | Avertir |
| 🔒 `/warnings <user>` | Voir les avertissements |
| 🔒 `/clear <nombre>` | Supprimer des messages en masse |

> **Automod** (réglable dans `/panel → Modules` + base de données) : anti-spam, anti-mentions de masse, anti-liens/invitations, anti-raid (lockdown automatique).

### 🧰 Utilitaires
| Commande | Description |
|---|---|
| 🔒 `/poll <question> <options>` | Sondage |
| 🔒 `/giveaway ...` | Tirage au sort |
| 🔒 `/reactionrole add\|remove` | Rôles par réaction |

### ⭐ Mise en route conseillée
1. `/panel → Channels` : règle les salons (bienvenue, rank-up, logs, quiz).
2. `/panel → Modules` : active bienvenue, rank-up, automod.
3. `/panel → Auto-quiz` : choisis le salon, les horaires, puis **Turn ON**.
4. `/panel → Pulsar` : choisis le salon, **Turn ON** (clé IA requise).
5. `/panel → Shop` : ajoute des articles.
6. `/panel → Economy` : ajuste les gains si besoin.

---
---

# 🇬🇧 MANUAL (English)

## 1. What is Pulse Engine?

An all-in-one community bot that runs **24/7 on its own** and handles:

- **💰 A points economy (PULSE)** earned automatically by activity (messages, reactions, voice minutes).
- **🏆 Ranks** that climb with activity, with announcements.
- **🎮 ~12 games** (solo, duel, multiplayer) where you bet and win PULSE.
- **🛒 A shop** to spend PULSE.
- **🎰 An automatic lottery** with a jackpot and draws.
- **🧠 Community quizzes** auto-generated and launched by AI.
- **🤖 Pulsar**, an AI community-manager that keeps the server alive.
- **🎯 Missions** launched automatically or on demand.
- **🛡️ Moderation**, manual and automatic (anti-spam, anti-raid…).
- **👋 Welcome messages** and announcements.

Everything is controlled from the **`/panel`** admin menu.

> ⚙️ **AI features** (Pulsar, auto-quiz, riddles) need an `ANTHROPIC_API_KEY` set in Railway. Without it, the rest of the bot works normally.

## 2. Member commands

### 💰 Economy & profile
| Command | Description |
|---|---|
| `/balance` | Check your PULSE balance |
| `/profile [user]` | Your (or a member's) profile: points, rank, PULSE |
| `/leaderboard` | Top players |
| `/daily` | Claim your daily reward (with streak bonus 🔥) |
| `/missions` | View active missions |
| `/shop [category]` | Browse the shop |
| `/buy <item>` | Buy an item |

> You earn PULSE **automatically** by being active: messages, reactions, voice minutes.

### 🎮 Solo games
| Command | Description |
|---|---|
| `/higherlower <bet>` | Higher or Lower — cash out before you miss |
| `/crash <bet>` | Cash out before the multiplier crashes |
| `/slots <bet>` | Slot machine |
| `/roulette <bet> ...` | European roulette |
| `/blackjack <bet>` | Blackjack vs the dealer |
| `/wheel <bet>` | Gacha wheel — big multipliers possible |
| `/quiz [difficulty]` | Solo quiz to earn PULSE |

### ⚔️ Duel & multiplayer games
| Command | Description |
|---|---|
| `/duel <player> <bet>` | Challenge a player |
| `/rps <player> <bet>` | Rock Paper Scissors |
| `/typingrace [bet]` | Typing race (multiple players) |
| `/battleroyale [bet]` | Battle Royale — last one standing takes the pot |
| `/diceroyale [bet]` | Dice Royale — highest roll wins |

> **Multiplayer lobby**: click **🙋 Join**. Only the host can **▶️ Start** (min. 2) or **✖️ Cancel** (refunds all). No time/player limit. Battle Royale plays out message-by-message, like match commentary.

### 🎰 Lottery
| Command | Description |
|---|---|
| `/lottery status` | See jackpot, your tickets and draw time |
| `/lottery buy <tickets>` | Buy tickets |

> The draw is automatic; more tickets = better odds. The bot reminds the jackpot through the day.

### 🧠 Community quiz
Quizzes auto-launch (admin-configured). Everyone answers with buttons and earns PULSE per correct answer; a bonus question can be worth double.

## 3. 🤖 Pulsar — the AI host

When enabled, Pulsar:
- **Animates the channel** with questions, icebreakers and hype — **even when it's quiet**, to revive the chat.
- **Checks in** on recently active members.
- **Replies** when mentioned or replied to.
- **Welcomes** newcomers with a personalized message (else the classic welcome embed).
- **Hosts events**: writes the quiz and lottery announcements in its voice.
- **Daily recap** with shout-outs.
- **Celebrates** rank-ups and member milestones.
- **Launches missions** (next section).

> Pulsar never pings @everyone/roles and never invents facts.

**Enable**: `/panel → Pulsar` → pick the channel → **Turn ON**. Toggles: Settings (language/frequency/recap time), Tag members, Replies, Welcomes, Host events, Daily recap, Celebrate, and **Post now**.

## 4. 🎯 Missions

Launched automatically (~every 6h, configurable) **and** on demand via `/panel → Missions`.

| Type | How it works |
|---|---|
| ⚡ **Flash** | First N to tap **Claim** win PULSE (e.g. first 3 → 50 PULSE, 30 min) |
| 🧩 **Riddle** | AI riddle; first correct answer (via button) wins |
| 📅 **Daily objective** | Auto-tracked goal (e.g. send 20 messages) → PULSE auto-credited |
| 🗓️ **Weekly objective** | Same, weekly, bigger reward (e.g. play 5 games) |

Auto-tracked metrics: messages, reactions, quiz wins, lottery tickets, **games played**.

Admin (`/panel → Missions`): **Flash / Riddle / Daily / Weekly** buttons, plus **List active**, **End all**, **Auto-launch ON/OFF**.

## 5. 🛠️ Administration — the `/panel`

Type **`/panel`** (admins only). Sections: Home, Modules, Channels, Auto-quiz, Economy, Give/remove PULSE, Shop, Pulsar, Missions.

### Manage PULSE
| Command | Description |
|---|---|
| 🔒 `/givepulse <user> <amount> [reason]` | Give PULSE |
| 🔒 `/removepulse <user> <amount> [reason]` | Remove PULSE |
| 🔒 `/setpulse <user> <amount> [reason]` | Set an exact balance |
| 🔒 `/pulseinfo <user>` | A member's economy stats |

### General settings
| Command | Description |
|---|---|
| 🔒 `/module <feature> <on/off>` | welcome, rankup, automod, pulsehour, dailycap, streak, decay |
| 🔒 `/seteconomy <setting> <value>` | PULSE/point, points per message/reaction/voice/invite/event |
| 🔒 `/shopadmin add\|remove\|setprice\|toggle\|list` | Manage the shop |

### Messages & announcements
| Command | Description |
|---|---|
| 🔒 `/welcome ...` | Welcome message |
| 🔒 `/rankup ...` | Rank-up announcements |
| 🔒 `/modlog ...` | Moderation log channel |

> Welcome placeholders: `{username}`, `{mention}`, `{server}`, `{member_count}`.

### Automatic community quiz
| Command | Description |
|---|---|
| 🔒 `/quizadmin add` | Add a question |
| 🔒 `/quizadmin generate <topic> <count>` | AI-generate questions |
| 🔒 `/quizadmin list\|remove` | List / remove questions |
| 🔒 `/autoquiz channel\|interval\|times\|topics\|settings\|toggle\|now\|status` | Configure auto quizzes |

### Moderation
| Command | Description |
|---|---|
| 🔒 `/ban` `/unban` `/kick` `/mute` `/unmute` `/warn` `/warnings` `/clear` | Standard moderation tools |

> **Automod** (in `/panel → Modules`): anti-spam, anti-mass-mentions, anti-links/invites, anti-raid (auto lockdown).

### Utilities
| Command | Description |
|---|---|
| 🔒 `/poll` `/giveaway` `/reactionrole` | Polls, giveaways, reaction roles |

### ⭐ Recommended setup
1. `/panel → Channels`: set channels.
2. `/panel → Modules`: enable welcome, rank-up, automod.
3. `/panel → Auto-quiz`: channel + times, then **Turn ON**.
4. `/panel → Pulsar`: channel, then **Turn ON** (AI key required).
5. `/panel → Shop`: stock items.
6. `/panel → Economy`: adjust earn rates.
