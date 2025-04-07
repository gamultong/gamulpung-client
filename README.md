# Gamulpung
It follows the same rules as Minesweeper. 
However, the map expands infinitely, and you can play with oher people in this website!

## What is this Project?
This project is an online multiplayer version of Minesweeper, where the map expands infinitely. Players can join and play together in real-time, making it a unique and engaging experience compared to the traditional single-player Minesweeper game.

### Features
- **Infinite Map**: The game map expands infinitely as you explore.
- **Multiplayer**: Play with other people in real-time.
- **Chat**: Press Enter and Chat with other players.
- **Real-time Updates**: See the moves of other players instantly.

### Technologies Used
- **Frontend**: Next.js, Zustand, Scss, Pixi/react
- **Backend**: FastAPI
- **WebSocket**: For real-time communication

### Project Structure
- **/src**: Contains the source code for the frontend and backend.
- **/public**: Contains static files and assets.
- **/putlic/documents**: Contains Documents for Contribute.

## Play
Let's play the game [here](https://gamultong.github.io/gamulpung-client/).

## Contribute
Here's more information to contribute this project: https://gamultong.github.io/gamulpung-client/documents/contribute-guide/?lang=en#overviewofcontributersguide

If you want to contribute this project, Follow these steps.
### Fork this repository

1. Navigate to the GitHub repository you want to fork.
2. In the top-right corner of the repository page, click the "Fork" button.
3. GitHub will create a copy of the repository in your own GitHub account.
4. You can now clone the forked repository to your local machine using the following command:
```bash
git clone https://github.com/your-username/minesweeper-client.git
```
5. Make changes to the code in your local repository.
6. Commit and push your changes to your forked repository on GitHub.
7. If you want to contribute your changes back to the original repository, create a pull request:
  - Go to your forked repository on GitHub.
  - Click the "Pull Request" button.
  - Compare your changes with the original repository.
  - Add a title and description for your pull request.
  - Click "Create Pull Request".

### How to set devleopment environment.
1. Setting Environments
```
node >= 20.10
npm >= 10.9
```

In .env file, There are two environment values.
```
NEXT_PUBLIC_WS_HOST = 
NEXT_PUBLIC_HOST = "http://localhost:3001/gamulpung-client"
```

Mail me to get websocket host url:
Email: kkh061101@naver.com

2. Install Dependencies.
```bash
npm install 
```

3. Run Development Server.
```bash
npm run dev
```

4. Test Linting Codes Before Building.
```bash
npm run lint
```
