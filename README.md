# Gamulpung
It follows the same rules as Minesweeper. 
However, the map expands infinitely, and you can play with oher people in this website!

## What is this Project?
This project is an online multiplayer version of Minesweeper, where the map expands infinitely. Players can join and play together in real-time, making it a unique and engaging experience compared to the traditional single-player Minesweeper game.

### Features
- **Infinite Map**: The game map expands infinitely as you explore.
- **Multiplayer**: Play with other people in real-time.
- **Real-time Updates**: See the moves of other players instantly.
- **User-friendly Interface**: Easy to navigate and play.

### Technologies Used
- **Frontend**: Next.js
- **WebSocket**: For real-time communication

### Project Structure
- **/src**: Contains the source code for the frontend and backend.
- **/public**: Contains static files and assets.

### Getting Started
To get started with the project, follow the instructions in the "Contribute" section below to set up your development environment and start contributing.

## Play
Let's play the game [here](https://gamultong.github.io/gamulpung-client/).

## Contribute
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
2. Install Dependencies.
```bash
# Because React 19 does not support previous dependencies before version 19.
npm install --force 
```

3. Run Development Server.
```bash
npm run dev
```

4. Test Linting Codes Before Building.
```bash
npm run lint
```
