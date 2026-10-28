# WildFlip online setup

WildFlip plays offline with no setup. Online play adds Google sign-in, a profile that lives on a server (so coins and cards can't be edited in the browser), and **Find a Player** games against other people. It runs on Firebase:

- **Authentication**: Google sign-in.
- **Cloud Firestore**: profiles, games, the player queue and the card pool.
- **Cloud Functions** (`functions/`): the server. It runs every online game, pack, card claim and reward with the same rules file the browser uses (`cards-rules.js`).

This takes about 20 minutes. The steps happen in the Firebase console, plus one command-line deploy, which you can run in your browser with Google Cloud Shell.

## 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and **Create a project**. Use a new project just for WildFlip, for example `wildflip`, so its rules can't clash with another app's. Google Analytics isn't needed.
2. Switch the project to the **Blaze (pay as you go)** plan: the gear icon → **Usage and billing** → **Details & settings** → **Modify plan**. Cloud Functions need Blaze. At hobby scale the bill should stay at $0, since the free allowances cover millions of function calls and tens of thousands of database reads a day. Set a **budget alert** (for example $5) while you're there so you'd hear about any surprise.

## 2. Turn on Google sign-in

1. **Build → Authentication → Get started**.
2. **Sign-in method → Google → Enable**, choose a support email, **Save**.
3. **Settings → Authorized domains → Add domain**: `jayhawklegion.github.io`

## 3. Create the database

**Build → Firestore Database → Create database**. Pick a location near your players (it can't be changed later) and start in **production mode**. The deploy in step 5 replaces the starter rules with WildFlip's (`firestore.rules`).

## 4. Connect the site to the project

1. Gear icon → **Project settings → General → Your apps → Web (`</>`)**. Register an app (any nickname, no Hosting needed).
2. Copy the `firebaseConfig` object it shows.
3. In this repository, open `cards-cloud-config.js`, replace `null` with the copied object, then commit and push. The config only names the project, so it's safe to publish.

## 5. Deploy the server

This uploads the Cloud Functions and the Firestore rules. The easiest way is **Google Cloud Shell**, a terminal in your browser with everything already installed.

1. Open [shell.cloud.google.com](https://shell.cloud.google.com) while signed in with the same Google account.
2. Run these commands one at a time:

   ```sh
   git clone https://github.com/JayhawkLegion/Adv-TickTackToe.git
   cd Adv-TickTackToe
   git checkout claude/card-game-3x3-collection-zfwa84   # or main, once this is merged
   npx firebase-tools@15.33.0 login --no-localhost
   npx firebase-tools@15.33.0 use --add                  # pick your project, alias: default
   (cd functions && npm ci)
   npx firebase-tools@15.33.0 deploy --only firestore,functions
   ```

   `login` prints a link. Open it, sign in, and paste the code back into the terminal.

The first deploy switches on some Google Cloud services (Cloud Build, Artifact Registry, Cloud Scheduler and others) and can take several minutes. If it fails partway with a message about an API that was just enabled, wait a minute and run the deploy again. If it asks how long to keep container images, accept the default.

Re-run the last command whenever `functions/`, `firestore.rules` or **`cards-rules.js`** changes. The server copies `cards-rules.js` when it deploys, so a rule change needs both a push to GitHub (for the site) and a deploy (for the server).

## 6. Make yourself an admin

Admins can change the online card pool in the Card Builder.

1. Open WildFlip, go to **Settings** and **Sign in with Google**.
2. In the Firebase console: **Authentication → Users**, then copy your **User UID**.
3. **Firestore Database → Start collection**: collection ID `admins`, document ID = your UID, then add any field (for example `role` = `admin`) and **Save**.

Reload the Card Builder. It now says you're an admin, and your changes go to every player. To bring over cards you built offline, sign out, use **Export Cards** in the Card Builder, sign back in, and **Import Cards**.

## 7. Try it

Open the game in two browsers signed in with two different Google accounts (a normal window and a private window work). Tap **Find a Player** in both, and they'll be paired.

## How online play works

- **Separate profiles.** An online player starts fresh, with 5 starter cards and 100 coins. The offline player saved on a device stays there for playing while signed out. Signing in or out switches between the two.
- **Coins.** Against the computer a game pays 3 for a win and 1 for a loss. Against a person it pays 30 and 10. Both are set in `COIN_REWARDS` in `cards-rules.js`. Resigning or running out of time pays nothing.
- **Find a Player.** Joining pairs you with the waiting player closest to your level and hand strength (the total of your hand's numbers, upgrades included). The allowed gap widens the longer anyone waits, so with few players around a match can take a minute. If nobody turns up within 30 seconds, you're offered a game against the computer instead.
- **Experience and the computer.** Every finished game earns XP (a resigned or forfeited game earns no XP or coins). As your level rises, the computer makes fewer mistakes and its cards get upgrades. It always plays cards like yours (same rarity, the same total or a little less), so it can't be farmed for stronger cards. The tuning numbers are near the top of `cards-rules.js`.
- **Upgrades.** Duplicates of a card raise one side of a copy by 1 (each side once, up to 3 upgrades). Upgrades stay with that copy. A card someone claims comes plain.
- **Turn clock.** Each turn has 60 seconds. When time runs out the computer plays a move for that player, and two timeouts in a row forfeit the game. If both players leave, a server job that runs every minute finishes the game.
- **Strikes.** In a game against a person, each of the loser's cards that ends in the winner's color gets a strike. A copy's third strike removes it from the collection, and nobody receives it.
- **Card claims.** The winner can claim a copy of one of the opponent's cards that ended in their color. Cards they don't own yet are marked NEW. The loser keeps that card.

## Testing on your own computer (optional)

With [Node.js](https://nodejs.org) and Java 21 or later installed, you can run everything locally with the Firebase emulators:

```sh
(cd functions && npm ci && npm run copy-shared)
npx firebase-tools@15.33.0 emulators:start --project demo-cardclash
```

Then uncomment `WILDFLIP_FIREBASE_EMULATORS` in `cards-cloud-config.js`, set the config to `{ apiKey: "fake", authDomain: "localhost", projectId: "demo-cardclash" }`, and serve the site, for example with `python3 -m http.server`. Don't commit those two changes.
