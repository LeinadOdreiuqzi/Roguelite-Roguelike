class Renderer {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000); // FOV reducido para vista plana
        this.renderer = new THREE.WebGLRenderer();
        this.player = null;
        this.physics = null;
        this.targetCameraPosition = new THREE.Vector3();
        this.zoomLevel = 10; // Más alto para vista cenital
    }

    init() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        this.camera.position.set(0, 10, 5); // Vista cenital con ángulo ligero
        this.camera.lookAt(0, 0, 0);

        const ambientLight = new THREE.AmbientLight(0x404040);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(5, 10, 5);
        this.scene.add(directionalLight);

        window.addEventListener('resize', () => this.onWindowResize());
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    updateCamera(playerPosition) {
        this.targetCameraPosition.set(playerPosition.x, this.zoomLevel, playerPosition.z + 2); // Vista 2D/3D
        this.camera.position.lerp(this.targetCameraPosition, 0.1);
        this.camera.lookAt(playerPosition.x, 0, playerPosition.z);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    addToScene(object) {
        this.scene.add(object);
    }

    removeFromScene(object) {
        this.scene.remove(object);
    }

    setPhysics(physics) {
        this.physics = physics;
        this.player = this.physics.player;
    }

    setRoomLighting(room) {
        const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
        const pointLight = new THREE.PointLight(0xffdd99, 1.5, 15);
        pointLight.position.set(room.x, 5, room.z);
        
        this.scene.add(ambientLight);
        this.scene.add(pointLight);
    
        setTimeout(() => { this.scene.remove(pointLight); }, 5000);
    }
}

export { Renderer };