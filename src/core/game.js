import { Renderer } from './renderer.js';
import { Physics } from './physics.js';
import { GameScene } from '../scenes/gamescene.js';

class Game {
    constructor() {
        this.renderer = new Renderer();
        this.physics = new Physics(this.renderer, null); // Inicialmente sin scene
        this.renderer.setPhysics(this.physics);
        this.scene = null;
        this.currentScene = null;
        this.isRunning = false;

        this.state = {
            playerHealth: 100,
            level: 1,
            isGameOver: false
        };

        this.events = {};
        this.init();
    }

    init() {
        this.on('playerDeath', () => this.gameOver());
        this.on('levelUp', () => this.state.level++);

        this.start();
    }

    start() {
        this.isRunning = true;
        this.loadResources();
        this.scene = new GameScene(this.renderer, this.physics);
        this.physics.scene = this.scene; // Asignar scene después de crearla
        this.gameLoop();
    }

    loadResources() {
        console.log("Cargando recursos...");
        this.renderer.init();
    }

    gameLoop() {
        if (!this.isRunning) return;

        this.physics.update();
        this.renderer.render();

        requestAnimationFrame(() => this.gameLoop());
    }

    changeScene(scene) {
        this.currentScene = scene;
        console.log(`Cambiando a escena: ${scene}`);
    }

    gameOver() {
        this.isRunning = false;
        this.state.isGameOver = true;
        console.log("Game Over");
        this.changeScene('gameOver');
    }

    restart() {
        this.state = { playerHealth: 100, level: 1, isGameOver: false };
        this.start();
    }

    on(eventName, callback) {
        if (!this.events[eventName]) this.events[eventName] = [];
        this.events[eventName].push(callback);
    }

    emit(eventName, data) {
        if (this.events[eventName]) {
            this.events[eventName].forEach(callback => callback(data));
        }
    }
}

const game = new Game();
window.game = game;
export default Game;