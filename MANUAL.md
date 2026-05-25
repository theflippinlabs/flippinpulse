# Pulse Engine — Bot Manual / Manuel du bot

`<...>` = required / obligatoire · `[...]` = optional / optionnel · 🔒 = Administrator only / Admin uniquement

---

# 🇫🇷 Manuel (Français)

## 💰 Économie & profil (pour tout le monde)
| Commande | Description |
|---|---|
| `/balance` | Voir ton solde de PULSE |
| `/profile [user]` | Voir ton profil (ou celui d'un membre) : points, rang, PULSE |
| `/leaderboard` | Classement des meilleurs joueurs |
| `/daily` | Réclamer ta récompense quotidienne |
| `/missions` | Voir les missions actives |
| `/shop [catégorie]` | Parcourir la boutique |
| `/buy <objet>` | Acheter un objet de la boutique |

> Tu gagnes des PULSE automatiquement en étant actif : messages, réactions, minutes en vocal.

## 🎮 Jeux solo
| Commande | Description |
|---|---|
| `/higherlower <mise>` | Plus ou Moins : devine si le nombre suivant est plus haut/bas, encaisse avant de te tromper |
| `/crash <mise>` | Encaisse avant que le multiplicateur s'effondre |
| `/slots <mise>` | Machine à sous |
| `/roulette <mise> ...` | Roulette européenne |
| `/blackjack <mise>` | Blackjack contre le croupier |
| `/wheel <mise>` | Roue gacha — gros multiplicateurs possibles |
| `/quiz [difficulté]` | Quiz solo pour gagner des PULSE |

## ⚔️ Jeux de duel & multijoueur
| Commande | Description |
|---|---|
| `/duel <joueur> <mise>` | Défie un joueur en duel |
| `/rps <joueur> <mise>` | Pierre-feuille-ciseaux |
| `/typingrace [mise]` | Course de frappe (plusieurs joueurs) |
| `/battleroyale [mise]` | Battle Royale : on rejoint le lobby, le dernier survivant rafle la cagnotte |
| `/diceroyale [mise]` | Dé Royale : tout le monde lance les dés, le plus haut gagne |

> **Lobby multijoueur** (`/battleroyale`, `/diceroyale`) : clique **🙋 Rejoindre**. Seul l'hôte peut **▶️ Start** (min. 2 joueurs) ou **✖️ Cancel** (rembourse tout le monde). Aucune limite de temps ni de joueurs.

## 🎰 Loterie & quiz communautaire
| Commande | Description |
|---|---|
| `/lottery status` | Voir le jackpot, les tickets et le tirage |
| `/lottery buy <tickets>` | Acheter des tickets de loterie |

> Le bot lance aussi **automatiquement** des quiz communautaires (si l'admin l'a activé) : tout le monde répond par boutons et gagne des PULSE par bonne réponse.

---

## 🛠️ Commandes Administrateur

### 💰 Gérer les PULSE
| Commande | Description |
|---|---|
| 🔒 `/givepulse <user> <montant> [raison]` | Donner des PULSE |
| 🔒 `/removepulse <user> <montant> [raison]` | Retirer des PULSE |
| 🔒 `/setpulse <user> <montant> [raison]` | Fixer un solde exact |
| 🔒 `/pulseinfo <user>` | Voir les stats éco d'un membre |

### ⚙️ Réglages généraux
| Commande | Description |
|---|---|
| 🔒 `/module <fonction> <on/off>` | Activer/désactiver : welcome, rankup, automod, pulsehour, dailycap, streak, decay |
| 🔒 `/seteconomy <réglage> <valeur>` | Régler PULSE par point, points par message/réaction/vocal/invitation/événement |
| 🔒 `/shopadmin add\|remove\|setprice\|toggle\|list` | Gérer la boutique |

### 👋 Messages & annonces
| Commande | Description |
|---|---|
| 🔒 `/welcome channel\|title\|message\|color\|options\|toggle\|test\|status` | Configurer le message de bienvenue |
| 🔒 `/rankup channel\|toggle\|pinguser\|status` | Configurer les annonces de montée de rang |
| 🔒 `/modlog channel\|clear\|status` | Configurer le salon des logs de modération |

> Variables de texte (welcome) : `{username}`, `{mention}`, `{server}`, `{member_count}`.

### 🧠 Quiz communautaire automatique
| Commande | Description |
|---|---|
| 🔒 `/quizadmin add` | Ajouter une question (question, bonne réponse, mauvaises réponses, catégorie) |
| 🔒 `/quizadmin list [catégorie]` | Lister les questions |
| 🔒 `/quizadmin remove <contient>` | Supprimer une question |
| 🔒 `/autoquiz channel <#salon>` | Salon où poster les quiz |
| 🔒 `/autoquiz interval <heures>` | Fréquence des quiz auto |
| 🔒 `/autoquiz settings` | Questions/manche, secondes/question, récompense, catégorie |
| 🔒 `/autoquiz toggle <on/off>` | Activer/désactiver les quiz auto |
| 🔒 `/autoquiz now` | Lancer un quiz immédiatement |
| 🔒 `/autoquiz status` | Voir la configuration |

### 🔨 Modération
| Commande | Description |
|---|---|
| 🔒 `/ban <user> [raison] [jours]` | Bannir un membre |
| 🔒 `/unban <id>` | Débannir par ID |
| 🔒 `/kick <user> [raison]` | Expulser un membre |
| 🔒 `/mute <user> [durée] [raison]` | Rendre muet (timeout) |
| 🔒 `/unmute <user>` | Lever le mute |
| 🔒 `/warn <user> [raison]` | Avertir un membre |
| 🔒 `/warnings <user>` | Voir les avertissements |
| 🔒 `/clear <nombre>` | Supprimer des messages en masse |

### 🧰 Utilitaires (admin)
| Commande | Description |
|---|---|
| 🔒 `/poll <question> <options>` | Lancer un sondage |
| 🔒 `/giveaway ...` | Lancer un tirage au sort |
| 🔒 `/reactionrole add\|remove` | Rôles par réaction |

### ⭐ Mise en route conseillée
1. `/welcome channel` puis `/welcome message`, puis `/welcome toggle enabled:true`
2. `/rankup channel` puis `/rankup toggle enabled:true`
3. `/modlog channel`
4. `/quizadmin add` (catégorie ex. `kronos`, `main_city`), puis `/autoquiz channel`, `/autoquiz toggle enabled:true`
5. `/shopadmin add` pour remplir la boutique

---
---

# 🇬🇧 Manual (English)

## 💰 Economy & profile (everyone)
| Command | Description |
|---|---|
| `/balance` | Check your PULSE balance |
| `/profile [user]` | View your profile (or a member's): points, rank, PULSE |
| `/leaderboard` | Top players ranking |
| `/daily` | Claim your daily reward |
| `/missions` | View active missions |
| `/shop [category]` | Browse the shop |
| `/buy <item>` | Buy an item from the shop |

> You earn PULSE automatically by being active: messages, reactions, voice minutes.

## 🎮 Solo games
| Command | Description |
|---|---|
| `/higherlower <bet>` | Higher or Lower: guess the next number, cash out before you miss |
| `/crash <bet>` | Cash out before the multiplier crashes |
| `/slots <bet>` | Slot machine |
| `/roulette <bet> ...` | European roulette |
| `/blackjack <bet>` | Blackjack vs the dealer |
| `/wheel <bet>` | Gacha wheel — big multipliers possible |
| `/quiz [difficulty]` | Solo quiz to earn PULSE |

## ⚔️ Duel & multiplayer games
| Command | Description |
|---|---|
| `/duel <player> <bet>` | Challenge a player to a duel |
| `/rps <player> <bet>` | Rock Paper Scissors |
| `/typingrace [bet]` | Typing race (multiple players) |
| `/battleroyale [bet]` | Battle Royale: join the lobby, last one standing takes the pot |
| `/diceroyale [bet]` | Dice Royale: everyone rolls, highest wins |

> **Multiplayer lobby** (`/battleroyale`, `/diceroyale`): click **🙋 Join**. Only the host can **▶️ Start** (min. 2 players) or **✖️ Cancel** (refunds everyone). No time or player limit.

## 🎰 Lottery & community quiz
| Command | Description |
|---|---|
| `/lottery status` | See the jackpot, tickets and draw time |
| `/lottery buy <tickets>` | Buy lottery tickets |

> The bot also **auto-launches** community quizzes (if the admin enabled it): everyone answers with buttons and earns PULSE per correct answer.

---

## 🛠️ Administrator commands

### 💰 Manage PULSE
| Command | Description |
|---|---|
| 🔒 `/givepulse <user> <amount> [reason]` | Give PULSE |
| 🔒 `/removepulse <user> <amount> [reason]` | Remove PULSE |
| 🔒 `/setpulse <user> <amount> [reason]` | Set an exact balance |
| 🔒 `/pulseinfo <user>` | View a member's economy stats |

### ⚙️ General settings
| Command | Description |
|---|---|
| 🔒 `/module <feature> <on/off>` | Toggle: welcome, rankup, automod, pulsehour, dailycap, streak, decay |
| 🔒 `/seteconomy <setting> <value>` | Tune PULSE per point, points per message/reaction/voice/invite/event |
| 🔒 `/shopadmin add\|remove\|setprice\|toggle\|list` | Manage the shop |

### 👋 Messages & announcements
| Command | Description |
|---|---|
| 🔒 `/welcome channel\|title\|message\|color\|options\|toggle\|test\|status` | Configure the welcome message |
| 🔒 `/rankup channel\|toggle\|pinguser\|status` | Configure rank-up announcements |
| 🔒 `/modlog channel\|clear\|status` | Configure the moderation log channel |

> Welcome text placeholders: `{username}`, `{mention}`, `{server}`, `{member_count}`.

### 🧠 Automatic community quiz
| Command | Description |
|---|---|
| 🔒 `/quizadmin add` | Add a question (question, correct answer, wrong answers, category) |
| 🔒 `/quizadmin list [category]` | List questions |
| 🔒 `/quizadmin remove <contains>` | Remove a question |
| 🔒 `/autoquiz channel <#channel>` | Channel where quizzes are posted |
| 🔒 `/autoquiz interval <hours>` | How often quizzes auto-launch |
| 🔒 `/autoquiz settings` | Questions/round, seconds/question, reward, category |
| 🔒 `/autoquiz toggle <on/off>` | Enable/disable auto quizzes |
| 🔒 `/autoquiz now` | Launch a quiz immediately |
| 🔒 `/autoquiz status` | Show configuration |

### 🔨 Moderation
| Command | Description |
|---|---|
| 🔒 `/ban <user> [reason] [days]` | Ban a member |
| 🔒 `/unban <id>` | Unban by ID |
| 🔒 `/kick <user> [reason]` | Kick a member |
| 🔒 `/mute <user> [duration] [reason]` | Time out a member |
| 🔒 `/unmute <user>` | Remove a timeout |
| 🔒 `/warn <user> [reason]` | Warn a member |
| 🔒 `/warnings <user>` | View warnings |
| 🔒 `/clear <count>` | Bulk-delete messages |

### 🧰 Utilities (admin)
| Command | Description |
|---|---|
| 🔒 `/poll <question> <options>` | Start a poll |
| 🔒 `/giveaway ...` | Run a giveaway |
| 🔒 `/reactionrole add\|remove` | Reaction roles |

### ⭐ Recommended setup
1. `/welcome channel` then `/welcome message`, then `/welcome toggle enabled:true`
2. `/rankup channel` then `/rankup toggle enabled:true`
3. `/modlog channel`
4. `/quizadmin add` (category e.g. `kronos`, `main_city`), then `/autoquiz channel`, `/autoquiz toggle enabled:true`
5. `/shopadmin add` to stock the shop
