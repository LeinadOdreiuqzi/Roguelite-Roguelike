class GameScene {
    constructor(renderer, physics) {
        this.renderer = renderer;
        this.physics = physics;
        this.rooms = [];
        this.corridors = [];
        this.roomCount = 8;
        this.corridorWidth = 4;
        this.mapWidth = 100;
        this.mapHeight = 100;
        this.minRoomSize = 8;
        this.maxRoomSize = 24;
        this.minimapVisible = false;
        this.minimapCanvas = null;
        this.doorPositions = new Set();
        this.corridorConnections = new Set();
        this.doorMinDistance = this.corridorWidth * 1.2;
        // Vincular métodos para evitar problemas de contexto
        this.adjustWallLength = this.adjustWallLength.bind(this);
        this.init();
    }

    init() {
        this.generateDungeon();
        this.placePlayer();
        this.setupMinimap();
    }

    generateDungeon() {
        this.doorPositions = new Set();
        this.corridorConnections = new Set();
        this.rooms = [];
        this.corridors = [];
    
        const bspTree = this.generateBSPTree(this.mapWidth, this.mapHeight);
        this.generateRoomsFromBSP(bspTree);
        this.trimOverlappingRooms();
    
        this.connectRoomsWithKruskal();
    
        this.rooms.forEach((room) => this.addRoomToScene(room));
        this.corridors.forEach((corridor) => this.addCorridorToScene(corridor));
    
        this.removeWallExcess();
    
        console.log(
            "Dungeon generation complete:",
            `${this.rooms.length} rooms,`,
            `${this.corridors.length} corridors,`,
            `${this.doorPositions.size} doors`
        );
    }

    generateBSPTree(width, height) {
        const root = { x: -width / 2, y: -height / 2, width, height };
        const nodes = [root];
        let splits = 0;
        const maxSplits = this.roomCount;

        while (splits < maxSplits) {
            const nodeIndex = Math.floor(Math.random() * nodes.length);
            const node = nodes[nodeIndex];
            if (
                node.width < this.minRoomSize * 2 &&
                node.height < this.minRoomSize * 2
            )
                continue;

            const splitHorizontally = Math.random() > 0.5;
            if (splitHorizontally && node.height > this.minRoomSize * 2) {
                const splitY =
                    node.y +
                    this.minRoomSize +
                    Math.random() * (node.height - 2 * this.minRoomSize);
                const topNode = {
                    x: node.x,
                    y: node.y,
                    width: node.width,
                    height: splitY - node.y,
                };
                const bottomNode = {
                    x: node.x,
                    y: splitY,
                    width: node.width,
                    height: node.height - (splitY - node.y),
                };
                nodes.splice(nodeIndex, 1, topNode, bottomNode);
                splits++;
            } else if (node.width > this.minRoomSize * 2) {
                const splitX =
                    node.x +
                    this.minRoomSize +
                    Math.random() * (node.width - 2 * this.minRoomSize);
                const leftNode = {
                    x: node.x,
                    y: node.y,
                    width: splitX - node.x,
                    height: node.height,
                };
                const rightNode = {
                    x: splitX,
                    y: node.y,
                    width: node.width - (splitX - node.x),
                    height: node.height,
                };
                nodes.splice(nodeIndex, 1, leftNode, rightNode);
                splits++;
            }
        }

        return nodes;
    }

    generateRoomsFromBSP(nodes) {
        let bossAssigned = false;

        const startNode = nodes[0];
        const bossNode = nodes[nodes.length - 1];

        const startWidth = startNode
            ? Math.min(this.maxRoomSize, Math.max(this.minRoomSize + 4, startNode.width - 4))
            : this.minRoomSize + 6;
        const startHeight = startNode
            ? Math.min(this.maxRoomSize, Math.max(this.minRoomSize + 4, startNode.height - 4))
            : this.minRoomSize + 6;
        const startX = startNode
            ? startNode.x + (startNode.width - startWidth) / 2
            : -this.mapWidth / 4;
        const startZ = startNode
            ? startNode.y + (startNode.height - startHeight) / 2
            : -this.mapHeight / 4;

        const startRoom = this.createRoom("start", startWidth, startHeight, startX, startZ);
        this.rooms.push(startRoom);

        const bossWidth = bossNode
            ? Math.min(this.maxRoomSize, Math.max(this.minRoomSize + 4, bossNode.width - 4))
            : this.minRoomSize + 8;
        const bossHeight = bossNode
            ? Math.min(this.maxRoomSize, Math.max(this.minRoomSize + 4, bossNode.height - 4))
            : this.minRoomSize + 8;
        const bossX = bossNode
            ? bossNode.x + (bossNode.width - bossWidth) / 2
            : this.mapWidth / 4;
        const bossZ = bossNode
            ? bossNode.y + (bossNode.height - bossHeight) / 2
            : this.mapHeight / 4;

        const bossRoom = this.createRoom("boss", bossWidth, bossHeight, bossX, bossZ);
        this.rooms.push(bossRoom);
        bossAssigned = true;

        nodes.forEach((node, index) => {
            if (index === 0 || (index === nodes.length - 1 && bossAssigned)) {
                return;
            }

            const variationFactor = 0.8 + Math.random() * 0.4;
            const width = Math.min(
                this.maxRoomSize,
                Math.max(this.minRoomSize, node.width * variationFactor - 4)
            );
            const height = Math.min(
                this.maxRoomSize,
                Math.max(this.minRoomSize, node.height * variationFactor - 4)
            );

            const offsetX = (Math.random() - 0.5) * 2;
            const offsetZ = (Math.random() - 0.5) * 2;
            let x = node.x + (node.width - width) / 2 + offsetX;
            let z = node.y + (node.height - height) / 2 + offsetZ;

            const distStart = Math.sqrt((x - startX) ** 2 + (z - startZ) ** 2);
            const distBoss = Math.sqrt((x - bossX) ** 2 + (z - bossZ) ** 2);
            const totalDist = distStart + distBoss;
            const desiredRatio = 0.5;

            if (totalDist > 0) {
                const currentRatio = distStart / totalDist;
                if (currentRatio < 0.3) {
                    x += (bossX - x) * 0.2;
                    z += (bossZ - z) * 0.2;
                } else if (currentRatio > 0.7) {
                    x += (startX - x) * 0.2;
                    z += (startZ - z) * 0.2;
                }
            }

            const margin = this.maxRoomSize / 2;
            x = Math.max(-this.mapWidth / 2 + margin, Math.min(this.mapWidth / 2 - margin, x));
            z = Math.max(-this.mapHeight / 2 + margin, Math.min(this.mapHeight / 2 - margin, z));

            const isSecretRoom = Math.random() < 0.15;
            const isShopRoom = !isSecretRoom && Math.random() < 0.1;
            const type = isSecretRoom ? "secret" : isShopRoom ? "shop" : "normal";

            let intersectsCorridor = false;
            const newRoom = { x, z, width, depth: height };
            for (const corridor of this.corridors) {
                if (this.intersectsCorridor(newRoom, corridor)) {
                    intersectsCorridor = true;
                    break;
                }
            }

            let tooCloseToExistingRoom = false;
            for (const room of this.rooms) {
                const dx = Math.abs(x - room.x);
                const dz = Math.abs(z - room.z);
                if (
                    dx < (width + room.width) / 2 + this.corridorWidth / 2 &&
                    dz < (height + room.depth) / 2 + this.corridorWidth / 2
                ) {
                    tooCloseToExistingRoom = true;
                    break;
                }
            }

            if (!intersectsCorridor && !tooCloseToExistingRoom) {
                const room = this.createRoom(type, width, height, x, z);
                this.rooms.push(room);
            }
        });

        const minRooms = Math.max(8, this.roomCount);
        if (this.rooms.length < minRooms) {
            const attempts = 50;
            for (let i = 0; i < attempts && this.rooms.length < minRooms; i++) {
                this.addRandomRoom();
            }
        }

        console.log(`Generated ${this.rooms.length} rooms`);

        this.largestRoom = this.rooms[0];
        for (const room of this.rooms) {
            if (room.width * room.depth > this.largestRoom.width * this.largestRoom.depth) {
                this.largestRoom = room;
            }
        }
    }

    // New helper method to add a random room in an empty area
    addRandomRoom() {
        const maxAttempts = 10;
        let attempt = 0;
        while (attempt < maxAttempts) {
            const x = (Math.random() - 0.5) * this.mapWidth;
            const z = (Math.random() - 0.5) * this.mapHeight;

            const width = this.minRoomSize + Math.random() * (this.maxRoomSize - this.minRoomSize);
            const height = this.minRoomSize + Math.random() * (this.maxRoomSize - this.minRoomSize);

            const newRoom = { x, z, width, depth: height };
            let validPosition = true;

            for (const room of this.rooms) {
                const dx = Math.abs(x - room.x);
                const dz = Math.abs(z - room.z);
                if (
                    dx < (width + room.width) / 2 + this.corridorWidth / 2 &&
                    dz < (height + room.depth) / 2 + this.corridorWidth / 2
                ) {
                    validPosition = false;
                    break;
                }
            }

            for (const corridor of this.corridors) {
                if (this.intersectsCorridor(newRoom, corridor)) {
                    validPosition = false;
                    break;
                }
            }

            if (validPosition) {
                const type = Math.random() < 0.2 ? "secret" : "normal";
                const room = this.createRoom(type, width, height, x, z);
                this.rooms.push(room);
                console.log(`Added random room at ${x}, ${z}`);
                return true;
            }

            attempt++;
        }

        return false;
    }

    intersectsCorridor(room, corridor) {
        const midX =
            corridor.walls && corridor.walls[0]
                ? corridor.walls[0].mesh.position.x
                : corridor.floor.position.x;
        const midZ =
            corridor.walls && corridor.walls[0]
                ? corridor.walls[0].mesh.position.z
                : corridor.floor.position.z;
        const lengthX =
            corridor.walls && corridor.walls[0]
                ? corridor.walls[0].mesh.geometry.parameters.width ||
                this.corridorWidth
                : this.corridorWidth;
        const lengthZ =
            corridor.walls && corridor.walls[0]
                ? corridor.walls[0].mesh.geometry.parameters.depth ||
                this.corridorWidth
                : this.corridorWidth;

        const r1 = {
            left: room.x - room.width / 2,
            right: room.x + room.width / 2,
            top: room.z - room.depth / 2,
            bottom: room.z + room.depth / 2,
        };
        const r2 = {
            left: midX - lengthX / 2,
            right: midX + lengthX / 2,
            top: midZ - lengthZ / 2,
            bottom: midZ + lengthZ / 2,
        };

        return !(
            r1.right < r2.left ||
            r1.left > r2.right ||
            r1.bottom < r2.top ||
            r1.top > r2.bottom
        );
    }

    trimOverlappingRooms() {
        for (let i = 0; i < this.rooms.length; i++) {
            for (let j = i + 1; j < this.rooms.length; j++) {
                const roomA = this.rooms[i];
                const roomB = this.rooms[j];
                const distX = Math.abs(roomA.x - roomB.x);
                const distZ = Math.abs(roomA.z - roomB.z);
                const combinedWidth = (roomA.width + roomB.width) / 2;
                const combinedDepth = (roomA.depth + roomB.depth) / 2;

                if (distX < combinedWidth && distZ < combinedDepth) {
                    const overlapX = combinedWidth - distX;
                    const overlapZ = combinedDepth - distZ;

                    if (overlapX > 0) {
                        const adjustX = overlapX / 2;
                        if (roomA.x < roomB.x) {
                            roomA.width -= adjustX;
                            roomB.x += adjustX;
                            roomB.width -= adjustX;
                        } else {
                            roomB.width -= adjustX;
                            roomA.x += adjustX;
                            roomA.width -= adjustX;
                        }
                    }
                    if (overlapZ > 0) {
                        const adjustZ = overlapZ / 2;
                        if (roomA.z < roomB.z) {
                            roomA.depth -= adjustZ;
                            roomB.z += adjustZ;
                            roomB.depth -= adjustZ;
                        } else {
                            roomB.depth -= adjustZ;
                            roomA.z += adjustZ;
                            roomA.depth -= adjustZ;
                        }
                    }

                    roomA.walls.forEach((wall) => {
                        if (wall.direction === "north")
                            wall.mesh.position.z = -roomA.depth / 2;
                        if (wall.direction === "south")
                            wall.mesh.position.z = roomA.depth / 2;
                        if (wall.direction === "east")
                            wall.mesh.position.x = roomA.width / 2;
                        if (wall.direction === "west")
                            wall.mesh.position.x = -roomA.width / 2;
                        // Dispose old geometry before replacement
                        if (wall.mesh.geometry) wall.mesh.geometry.dispose();
                        wall.mesh.geometry = new THREE.PlaneGeometry(
                            wall.direction === "north" ||
                                wall.direction === "south"
                                ? roomA.width
                                : roomA.depth,
                            5,
                        );
                    });
                    if (roomA.floor.geometry) roomA.floor.geometry.dispose();
                    roomA.floor.geometry = new THREE.PlaneGeometry(
                        roomA.width,
                        roomA.depth,
                    );
                    if (roomA.ceiling.geometry)
                        roomA.ceiling.geometry.dispose();
                    roomA.ceiling.geometry = new THREE.PlaneGeometry(
                        roomA.width,
                        roomA.depth,
                    );

                    roomB.walls.forEach((wall) => {
                        if (wall.direction === "north")
                            wall.mesh.position.z = -roomB.depth / 2;
                        if (wall.direction === "south")
                            wall.mesh.position.z = roomB.depth / 2;
                        if (wall.direction === "east")
                            wall.mesh.position.x = roomB.width / 2;
                        if (wall.direction === "west")
                            wall.mesh.position.x = -roomB.width / 2;
                        wall.mesh.geometry = new THREE.PlaneGeometry(
                            wall.direction === "north" ||
                                wall.direction === "south"
                                ? roomB.width
                                : roomB.depth,
                            5,
                        );
                    });
                    roomB.floor.geometry = new THREE.PlaneGeometry(
                        roomB.width,
                        roomB.depth,
                    );
                    roomB.ceiling.geometry = new THREE.PlaneGeometry(
                        roomB.width,
                        roomB.depth,
                    );
                }
            }
        }
    }

    createRoom(type, width, depth, x, z) {
        const height = 5;
        const doors = [];
        const color =
            type === "boss"
                ? 0x880000
                : type === "shop"
                    ? 0x008800
                    : type === "secret"
                        ? 0x444444
                        : 0x555555;

        const wallMaterial = new THREE.MeshBasicMaterial({
            color,
            side: THREE.DoubleSide,
        });
        const walls = {
            north: new THREE.Mesh(
                new THREE.PlaneGeometry(width, height),
                wallMaterial,
            ),
            south: new THREE.Mesh(
                new THREE.PlaneGeometry(width, height),
                wallMaterial,
            ),
            east: new THREE.Mesh(
                new THREE.PlaneGeometry(depth, height),
                wallMaterial,
            ),
            west: new THREE.Mesh(
                new THREE.PlaneGeometry(depth, height),
                wallMaterial,
            ),
        };
        // Asegurar que las paredes estén correctamente posicionadas en los bordes de la habitación
        walls.north.rotation.y = Math.PI;
        walls.north.position.set(0, height / 2, -depth / 2);
        walls.south.position.set(0, height / 2, depth / 2);
        walls.east.rotation.y = Math.PI / 2;
        walls.east.position.set(width / 2, height / 2, 0);
        walls.west.rotation.y = -Math.PI / 2;
        walls.west.position.set(-width / 2, height / 2, 0);

        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(width, depth),
            new THREE.MeshBasicMaterial({ color: 0x333333 }),
        );
        floor.rotation.x = -Math.PI / 2;

        const ceiling = new THREE.Mesh(
            new THREE.PlaneGeometry(width, depth),
            new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0,
            }),
        );
        ceiling.rotation.x = Math.PI / 2;

        return {
            walls: Object.entries(walls).map(([direction, mesh]) => ({
                mesh,
                direction,
            })),
            floor,
            ceiling,
            x,
            z,
            width,
            depth,
            height,
            type,
            doors,
            visited: false,
        };
    }

    addRoomToScene(room) {
        room.walls.forEach((wall) => {
            // Ajustar la posición de la pared en relación al centro de la habitación
            wall.mesh.position.x += room.x;
            wall.mesh.position.z += room.z;
            this.renderer.addToScene(wall.mesh);
        });
        room.floor.position.set(room.x, 0, room.z);
        room.ceiling.position.set(room.x, room.height, room.z);
        this.renderer.addToScene(room.floor);
        this.renderer.addToScene(room.ceiling);
    }

    addCorridorToScene(corridor) {
        if (corridor.walls) {
            corridor.walls.forEach((wall) => {
                this.renderer.addToScene(wall.mesh);
            });
        }
        this.renderer.addToScene(corridor.floor);
        this.renderer.addToScene(corridor.ceiling);
    }

    getOppositeDirection(direction) {
        switch (direction) {
            case "north":
                return "south";
            case "south":
                return "north";
            case "east":
                return "west";
            case "west":
                return "east";
            default:
                return direction;
        }
    }

    openDoor(room, direction, doorWidth, corridorPos = null) {
        if (!room || !room.walls) {
            console.error(
                "Error: Room or room.walls is undefined in openDoor",
                room,
            );
            return;
        }

        if (!room.doors) {
            room.doors = [];
        }

        if (room.doors.includes(direction)) {
            return;
        }

        let wallToOpen = room.walls.find(
            (wall) => wall.direction === direction,
        );

        if (!wallToOpen) {
            const wallMaterial = new THREE.MeshBasicMaterial({
                color:
                    room.type === "boss"
                        ? 0x880000
                        : room.type === "shop"
                            ? 0x008800
                            : room.type === "secret"
                                ? 0x444444
                                : 0x555555,
                side: THREE.DoubleSide,
            });

            const newWall = new THREE.Mesh(
                new THREE.PlaneGeometry(
                    direction === "north" || direction === "south"
                        ? room.width
                        : room.depth,
                    5,
                ),
                wallMaterial,
            );

            if (direction === "north") {
                newWall.rotation.y = Math.PI;
                newWall.position.set(room.x, 2.5, room.z - room.depth / 2);
            } else if (direction === "south") {
                newWall.position.set(room.x, 2.5, room.z + room.depth / 2);
            } else if (direction === "east") {
                newWall.rotation.y = Math.PI / 2;
                newWall.position.set(room.x + room.width / 2, 2.5, room.z);
            } else if (direction === "west") {
                newWall.rotation.y = -Math.PI / 2;
                newWall.position.set(room.x - room.width / 2, 2.5, room.z);
            }

            room.walls.push({ mesh: newWall, direction: direction });
            this.renderer.addToScene(newWall);
            wallToOpen = room.walls[room.walls.length - 1];
        }

        const wallWidth = wallToOpen.mesh.geometry.parameters.width;
        const wallHeight = wallToOpen.mesh.geometry.parameters.height;
        const maxDoorWidth = Math.min(doorWidth, wallWidth * 0.6);

        let doorOffset = 0;
        if (corridorPos) {
            doorOffset =
                direction === "north" || direction === "south"
                    ? corridorPos.x - room.x
                    : corridorPos.z - room.z;

            const maxOffset = (wallWidth - maxDoorWidth) / 2;
            doorOffset = Math.max(Math.min(doorOffset, maxOffset), -maxOffset);
        }

        const leftWallWidth = (wallWidth - maxDoorWidth) / 2;
        const leftWall = new THREE.Mesh(
            new THREE.PlaneGeometry(leftWallWidth, wallHeight),
            wallToOpen.mesh.material,
        );
        const rightWall = new THREE.Mesh(
            new THREE.PlaneGeometry(leftWallWidth, wallHeight),
            wallToOpen.mesh.material,
        );

        leftWall.rotation.copy(wallToOpen.mesh.rotation);
        rightWall.rotation.copy(wallToOpen.mesh.rotation);
        leftWall.position.copy(wallToOpen.mesh.position);
        rightWall.position.copy(wallToOpen.mesh.position);

        if (direction === "north" || direction === "south") {
            leftWall.position.x -= maxDoorWidth / 2 + leftWallWidth / 2;
            rightWall.position.x += maxDoorWidth / 2 + leftWallWidth / 2;
            leftWall.position.x += doorOffset;
            rightWall.position.x += doorOffset;
        } else {
            leftWall.position.z -= maxDoorWidth / 2 + leftWallWidth / 2;
            rightWall.position.z += maxDoorWidth / 2 + leftWallWidth / 2;
            leftWall.position.z += doorOffset;
            rightWall.position.z += doorOffset;
        }

        const doorFrameMaterial = new THREE.MeshBasicMaterial({
            color:
                room.type === "boss"
                    ? 0xaa3333
                    : room.type === "shop"
                        ? 0x33aa33
                        : room.type === "secret"
                            ? 0x555555
                            : 0x888888,
        });

        let doorFrame;
        if (direction === "north" || direction === "south") {
            doorFrame = new THREE.Mesh(
                new THREE.BoxGeometry(maxDoorWidth + 0.2, 0.25, 0.25),
                doorFrameMaterial,
            );
            doorFrame.position.set(
                wallToOpen.mesh.position.x + doorOffset,
                wallToOpen.mesh.position.y + wallHeight / 2 - 0.3,
                wallToOpen.mesh.position.z,
            );
        } else {
            doorFrame = new THREE.Mesh(
                new THREE.BoxGeometry(0.25, 0.25, maxDoorWidth + 0.2),
                doorFrameMaterial,
            );
            doorFrame.position.set(
                wallToOpen.mesh.position.x,
                wallToOpen.mesh.position.y + wallHeight / 2 - 0.3,
                wallToOpen.mesh.position.z + doorOffset,
            );
        }

        let indicator = null;
        if (
            room.type === "boss" ||
            room.type === "shop" ||
            room.type === "secret"
        ) {
            indicator = new THREE.Mesh(
                new THREE.SphereGeometry(0.25, 8, 8),
                new THREE.MeshBasicMaterial({
                    color:
                        room.type === "boss"
                            ? 0xff0000
                            : room.type === "shop"
                                ? 0x00ff00
                                : 0xaaaaaa,
                }),
            );

            indicator.position.set(
                doorFrame.position.x,
                doorFrame.position.y + 0.2,
                doorFrame.position.z,
            );
        }

        this.renderer.removeFromScene(wallToOpen.mesh);
        if (wallToOpen.mesh.geometry) wallToOpen.mesh.geometry.dispose();

        room.walls = room.walls.filter((wall) => wall.direction !== direction);
        if (leftWallWidth > 0.5) {
            room.walls.push({ mesh: leftWall, direction: `${direction}_left` });
            room.walls.push({ mesh: rightWall, direction: `${direction}_right` });
            this.renderer.addToScene(leftWall);
            this.renderer.addToScene(rightWall);
        }

        this.renderer.addToScene(doorFrame);
        if (indicator) this.renderer.addToScene(indicator);

        const doorX =
            direction === "north" || direction === "south"
                ? room.x + doorOffset
                : direction === "east"
                    ? room.x + room.width / 2
                    : room.x - room.width / 2;

        const doorZ =
            direction === "east" || direction === "west"
                ? room.z + doorOffset
                : direction === "south"
                    ? room.z + room.depth / 2
                    : room.z - room.depth / 2;

        this.doorPositions.add(`${doorX},${doorZ}`);
    }

    getClosestDirection(roomA, roomB) {
        const dx = roomB.x - roomA.x;
        const dz = roomB.z - roomA.z;
        if (Math.abs(dx) > Math.abs(dz)) {
            return dx > 0 ? "east" : "west";
        } else {
            return dz > 0 ? "south" : "north";
        }
    }

    connectWithDoor(roomA, roomB, doorDirection) {
        const doorWidth = this.corridorWidth * 0.8;
        let doorPosA = { x: roomA.x, z: roomA.z };
        let doorPosB = { x: roomB.x, z: roomB.z };

        // Calcular posición común para alinear las puertas
        if (doorDirection === "north") {
            doorPosA.z = roomA.z - roomA.depth / 2;
            doorPosB.z = roomB.z + roomB.depth / 2;
            doorPosA.x = doorPosB.x = (doorPosA.x + doorPosB.x) / 2; // Alinear en el eje X
        } else if (doorDirection === "south") {
            doorPosA.z = roomA.z + roomA.depth / 2;
            doorPosB.z = roomB.z - roomB.depth / 2;
            doorPosA.x = doorPosB.x = (doorPosA.x + doorPosB.x) / 2; // Alinear en el eje X
        } else if (doorDirection === "east") {
            doorPosA.x = roomA.x + roomA.width / 2;
            doorPosB.x = roomB.x - roomB.width / 2;
            doorPosA.z = doorPosB.z = (doorPosA.z + doorPosB.z) / 2; // Alinear en el eje Z
        } else if (doorDirection === "west") {
            doorPosA.x = roomA.x - roomA.width / 2;
            doorPosB.x = roomB.x + roomB.width / 2;
            doorPosA.z = doorPosB.z = (doorPosA.z + doorPosB.z) / 2; // Alinear en el eje Z
        }

        this.openDoor(roomA, doorDirection, doorWidth, doorPosA);
        this.openDoor(
            roomB,
            this.getOppositeDirection(doorDirection),
            doorWidth,
            doorPosB,
        );
        roomA.doors.push(doorDirection);
        roomB.doors.push(this.getOppositeDirection(doorDirection));

        this.doorPositions.add(`${doorPosA.x},${doorPosA.z}`);
        this.doorPositions.add(`${doorPosB.x},${doorPosB.z}`);
    }

    createCorridorSegment(
        startX,
        startZ,
        endX,
        endZ,
        orientation,
        corridorMaterial,
        height,
    ) {
        let segment;
        if (orientation === "vertical") {
            const length = Math.abs(endZ - startZ);
            segment = {
                walls: [
                    {
                        mesh: new THREE.Mesh(
                            new THREE.PlaneGeometry(this.corridorWidth, height),
                            corridorMaterial,
                        ),
                        direction: "east",
                    },
                    {
                        mesh: new THREE.Mesh(
                            new THREE.PlaneGeometry(this.corridorWidth, height),
                            corridorMaterial,
                        ),
                        direction: "west",
                    },
                ],
                floor: new THREE.Mesh(
                    new THREE.PlaneGeometry(this.corridorWidth, length),
                    new THREE.MeshBasicMaterial({ color: 0x333333 }),
                ),
                ceiling: new THREE.Mesh(
                    new THREE.PlaneGeometry(this.corridorWidth, length),
                    new THREE.MeshBasicMaterial({
                        color: 0x777777,
                        transparent: true,
                        opacity: 0,
                    }),
                ),
            };
            segment.walls[0].mesh.rotation.y = Math.PI / 2;
            segment.walls[0].mesh.position.set(startX + this.corridorWidth / 2, height / 2, (startZ + endZ) / 2);
            segment.walls[1].mesh.rotation.y = -Math.PI / 2;
            segment.walls[1].mesh.position.set(startX - this.corridorWidth / 2, height / 2, (startZ + endZ) / 2);
            segment.floor.rotation.x = -Math.PI / 2;
            segment.ceiling.rotation.x = Math.PI / 2;

            const midZ = (startZ + endZ) / 2;
            segment.floor.position.set(startX, 0, midZ);
            segment.ceiling.position.set(startX, height, midZ);

            this.adjustWallLength(segment, startX, startZ, endX, endZ, "vertical");
        } else {
            const length = Math.abs(endX - startX);
            segment = {
                walls: [
                    {
                        mesh: new THREE.Mesh(
                            new THREE.PlaneGeometry(length, height),
                            corridorMaterial,
                        ),
                        direction: "north",
                    },
                    {
                        mesh: new THREE.Mesh(
                            new THREE.PlaneGeometry(length, height),
                            corridorMaterial,
                        ),
                        direction: "south",
                    },
                ],
                floor: new THREE.Mesh(
                    new THREE.PlaneGeometry(length, this.corridorWidth),
                    new THREE.MeshBasicMaterial({ color: 0x333333 }),
                ),
                ceiling: new THREE.Mesh(
                    new THREE.PlaneGeometry(length, this.corridorWidth),
                    new THREE.MeshBasicMaterial({
                        color: 0x777777,
                        transparent: true,
                        opacity: 0,
                    }),
                ),
            };
            segment.walls[0].mesh.rotation.y = Math.PI;
            segment.walls[0].mesh.position.set((startX + endX) / 2, height / 2, startZ - this.corridorWidth / 2);
            segment.walls[1].mesh.position.set((startX + endX) / 2, height / 2, startZ + this.corridorWidth / 2);
            segment.floor.rotation.x = -Math.PI / 2;
            segment.ceiling.rotation.x = Math.PI / 2;

            const midX = (startX + endX) / 2;
            segment.floor.position.set(midX, 0, startZ);
            segment.ceiling.position.set(midX, height, startZ);

            this.adjustWallLength(segment, startX, startZ, endX, endZ, "horizontal");
        }
        return segment;
    }
    calculateOverlap(wallBox, obstacleBox, direction) {
        console.log("calculateOverlap called with direction:", direction);
        const wallMin = wallBox.min;
        const wallMax = wallBox.max;
        const obsMin = obstacleBox.min;
        const obsMax = obstacleBox.max;

        if (
            direction === "north" ||
            direction === "south" ||
            direction === "north_left" ||
            direction === "north_right" ||
            direction === "south_left" ||
            direction === "south_right"
        ) {
            const overlapX =
                Math.min(wallMax.x, obsMax.x) - Math.max(wallMin.x, obsMin.x);
            if (overlapX > 0 && wallMin.z < obsMax.z && wallMax.z > obsMin.z) {
                return {
                    axis: "x",
                    amount: overlapX,
                    min: Math.max(wallMin.x, obsMin.x),
                    max: Math.min(wallMax.x, obsMax.x),
                };
            }
        } else {
            const overlapZ =
                Math.min(wallMax.z, obsMax.z) - Math.max(wallMin.z, obsMin.z);
            if (overlapZ > 0 && wallMin.x < obsMax.x && wallMax.x > obsMin.x) {
                return {
                    axis: "z",
                    amount: overlapZ,
                    min: Math.max(wallMin.z, obsMin.z),
                    max: Math.min(wallMax.z, obsMax.z),
                };
            }
        }
        return null;
    }
    adjustWallLength(segment, startX, startZ, endX, endZ, orientation) {
        const height = 5;
        segment.walls.forEach((wall) => {
            const wallBox = new THREE.Box3().setFromObject(wall.mesh);

            // Verificar intersecciones con habitaciones
            this.rooms.forEach((room) => {
                const roomBox = new THREE.Box3().setFromCenterAndSize(
                    new THREE.Vector3(room.x, height / 2, room.z),
                    new THREE.Vector3(room.width, height, room.depth),
                );
                if (wallBox.intersectsBox(roomBox)) {
                    const overlap = this.calculateOverlap(
                        wallBox,
                        roomBox,
                        wall.direction,
                    );
                    if (overlap) {
                        const newLength =
                            orientation === "vertical"
                                ? this.corridorWidth
                                : Math.abs(endX - startX) - overlap.amount;
                        if (newLength > 0) {
                            wall.mesh.geometry = new THREE.PlaneGeometry(
                                newLength,
                                height,
                            );
                            if (orientation === "horizontal") {
                                wall.mesh.position.x =
                                    startX + (endX - startX) / 2;
                            }
                        } else {
                            // Asegurar que la pared no se elimine completamente
                            wall.mesh.geometry = new THREE.PlaneGeometry(
                                Math.max(0.5, newLength),
                                height,
                            );
                            if (orientation === "horizontal") {
                                wall.mesh.position.x =
                                    startX + (endX - startX) / 2;
                            }
                        }
                    }
                }
            });

            // Verificar intersecciones con otros pasillos
            this.corridors.forEach((otherCorridor) => {
                if (otherCorridor === segment) return;
                const corridorBox = new THREE.Box3().setFromCenterAndSize(
                    new THREE.Vector3(
                        otherCorridor.floor.position.x,
                        height / 2,
                        otherCorridor.floor.position.z,
                    ),
                    new THREE.Vector3(
                        otherCorridor.floor.geometry.parameters.width,
                        height,
                        otherCorridor.floor.geometry.parameters.depth,
                    ),
                );
                if (wallBox.intersectsBox(corridorBox)) {
                    const overlap = this.calculateOverlap(
                        wallBox,
                        corridorBox,
                        wall.direction,
                    );
                    if (overlap) {
                        const newLength =
                            orientation === "vertical"
                                ? this.corridorWidth
                                : Math.abs(endX - startX) - overlap.amount;
                        if (newLength > 0) {
                            wall.mesh.geometry = new THREE.PlaneGeometry(
                                newLength,
                                height,
                            );
                            if (orientation === "horizontal") {
                                wall.mesh.position.x =
                                    startX + (endX - startX) / 2;
                            }
                        } else {
                            wall.mesh.geometry = new THREE.PlaneGeometry(
                                Math.max(0.5, newLength),
                                height,
                            );
                            if (orientation === "horizontal") {
                                wall.mesh.position.x =
                                    startX + (endX - startX) / 2;
                            }
                        }
                    }
                }
            });
        });

        // Asegurar que el segmento tenga paredes válidas
        if (segment.walls.length === 0) {
            const corridorMaterial = new THREE.MeshBasicMaterial({
                color: 0x777777,
                side: THREE.DoubleSide,
            });
            if (orientation === "vertical") {
                const length = Math.abs(endZ - startZ);
                segment.walls = [
                    {
                        mesh: new THREE.Mesh(
                            new THREE.PlaneGeometry(this.corridorWidth, height),
                            corridorMaterial,
                        ),
                        direction: "east",
                    },
                    {
                        mesh: new THREE.Mesh(
                            new THREE.PlaneGeometry(this.corridorWidth, height),
                            corridorMaterial,
                        ),
                        direction: "west",
                    },
                ];
                segment.walls[0].mesh.rotation.y = Math.PI / 2;
                segment.walls[0].mesh.position.x = startX + this.corridorWidth / 2;
                segment.walls[1].mesh.rotation.y = -Math.PI / 2;
                segment.walls[1].mesh.position.x = startX - this.corridorWidth / 2;
                const midZ = startZ + (endZ - startZ) / 2;
                segment.walls.forEach((wall) => {
                    wall.mesh.position.z = midZ;
                    wall.mesh.position.y = height / 2;
                });
            } else {
                const length = Math.abs(endX - startX);
                segment.walls = [
                    {
                        mesh: new THREE.Mesh(
                            new THREE.PlaneGeometry(length, height),
                            corridorMaterial,
                        ),
                        direction: "north",
                    },
                    {
                        mesh: new THREE.Mesh(
                            new THREE.PlaneGeometry(length, height),
                            corridorMaterial,
                        ),
                        direction: "south",
                    },
                ];
                segment.walls[0].mesh.rotation.y = Math.PI;
                segment.walls[0].mesh.position.z = startZ - this.corridorWidth / 2;
                segment.walls[1].mesh.position.z = startZ + this.corridorWidth / 2;
                const midX = startX + (endX - startX) / 2;
                segment.walls.forEach((wall) => {
                    wall.mesh.position.x = midX;
                    wall.mesh.position.y = height / 2;
                });
            }
        }
    }

    calculateOverlap(wallBox, obstacleBox, direction) {
        console.log("calculateOverlap called with direction:", direction);
        const wallMin = wallBox.min;
        const wallMax = wallBox.max;
        const obsMin = obstacleBox.min;
        const obsMax = obstacleBox.max;

        if (
            direction === "north" ||
            direction === "south" ||
            direction === "north_left" ||
            direction === "north_right" ||
            direction === "south_left" ||
            direction === "south_right"
        ) {
            const overlapX =
                Math.min(wallMax.x, obsMax.x) - Math.max(wallMin.x, obsMin.x);
            if (overlapX > 0 && wallMin.z < obsMax.z && wallMax.z > obsMin.z) {
                return {
                    axis: "x",
                    amount: overlapX,
                    min: Math.max(wallMin.x, obsMin.x),
                    max: Math.min(wallMax.x, obsMax.x),
                };
            }
        } else {
            const overlapZ =
                Math.min(wallMax.z, obsMax.z) - Math.max(wallMin.z, obsMin.z);
            if (overlapZ > 0 && wallMin.x < obsMax.x && wallMax.x > obsMin.x) {
                return {
                    axis: "z",
                    amount: overlapZ,
                    min: Math.max(wallMin.z, obsMin.z),
                    max: Math.min(wallMax.z, obsMax.z),
                };
            }
        }
        return null;
    }


    createCorridor(roomA, roomB, doorDirection) {
        if (!roomA || !roomB) {
            console.warn(
                "Attempted to create corridor between undefined rooms",
            );
            return;
        }
    
        if (!roomA.doors) roomA.doors = [];
        if (!roomB.doors) roomB.doors = [];
    
        const startX = roomA.x;
        const startZ = roomA.z;
        const endX = roomB.x;
        const endZ = roomB.z;
        const height = 5;
        const corridorMaterial = new THREE.MeshBasicMaterial({
            color: 0x777777,
            side: THREE.DoubleSide,
        });
        const doorWidth = this.corridorWidth * 0.8;
    
        const roomAMaxDoors =
            roomA.type === "start"
                ? 4
                : roomA.type === "boss"
                  ? 2
                  : roomA.type === "secret"
                    ? 1
                    : roomA.width * roomA.depth > 300
                      ? 5
                      : 3;
    
        const roomBMaxDoors =
            roomB.type === "start"
                ? 4
                : roomB.type === "boss"
                  ? 2
                  : roomB.type === "secret"
                    ? 1
                    : roomB.width * roomB.depth > 300
                      ? 5
                      : 3;
    
        if (
            roomA.doors.length >= roomAMaxDoors ||
            roomB.doors.length >= roomBMaxDoors
        ) {
            if (!(roomA.type === "start" || roomB.type === "start")) {
                return;
            }
        }
    
        let startPosX = startX,
            startPosZ = startZ,
            endPosX = endX,
            endPosZ = endZ;
        let doorPosXStart = startX,
            doorPosZStart = startZ,
            doorPosXEnd = endX,
            doorPosZEnd = endZ;
    
        if (doorDirection === "north") {
            startPosZ = startZ - roomA.depth / 2;
            endPosZ = endZ + roomB.depth / 2;
    
            if (Math.abs(startX - endX) < Math.max(roomA.width, roomB.width) * 0.6) {
                const midX = (startX + endX) / 2;
                if (
                    Math.abs(midX - startX) < roomA.width / 2 &&
                    Math.abs(midX - endX) < roomB.width / 2
                ) {
                    startPosX = endPosX = midX;
                } else {
                    startPosX = startX;
                    endPosX = endX;
                }
            } else {
                startPosX = startX;
                endPosX = endX;
            }
    
            doorPosZStart = startPosZ;
            doorPosZEnd = endPosZ;
            doorPosXStart = startPosX;
            doorPosXEnd = endPosX;
        } else if (doorDirection === "south") {
            startPosZ = startZ + roomA.depth / 2;
            endPosZ = endZ - roomB.depth / 2;
    
            if (Math.abs(startX - endX) < Math.max(roomA.width, roomB.width) * 0.6) {
                const midX = (startX + endX) / 2;
                if (
                    Math.abs(midX - startX) < roomA.width / 2 &&
                    Math.abs(midX - endX) < roomB.width / 2
                ) {
                    startPosX = endPosX = midX;
                } else {
                    startPosX = startX;
                    endPosX = endX;
                }
            } else {
                startPosX = startX;
                endPosX = endX;
            }
    
            doorPosZStart = startPosZ;
            doorPosZEnd = endPosZ;
            doorPosXStart = startPosX;
            doorPosXEnd = endPosX;
        } else if (doorDirection === "east") {
            startPosX = startX + roomA.width / 2;
            endPosX = endX - roomB.width / 2;
    
            if (Math.abs(startZ - endZ) < Math.max(roomA.depth, roomB.depth) * 0.6) {
                const midZ = (startZ + endZ) / 2;
                if (
                    Math.abs(midZ - startZ) < roomA.depth / 2 &&
                    Math.abs(midZ - endZ) < roomB.depth / 2
                ) {
                    startPosZ = endPosZ = midZ;
                } else {
                    startPosZ = startZ;
                    endPosZ = endZ;
                }
            } else {
                startPosZ = startZ;
                endPosZ = endZ;
            }
    
            doorPosXStart = startPosX;
            doorPosXEnd = endPosX;
            doorPosZStart = startPosZ;
            doorPosZEnd = endPosZ;
        } else if (doorDirection === "west") {
            startPosX = startX - roomA.width / 2;
            endPosX = endX + roomB.width / 2;
    
            if (Math.abs(startZ - endZ) < Math.max(roomA.depth, roomB.depth) * 0.6) {
                const midZ = (startZ + endZ) / 2;
                if (
                    Math.abs(midZ - startZ) < roomA.depth / 2 &&
                    Math.abs(midZ - endZ) < roomB.depth / 2
                ) {
                    startPosZ = endPosZ = midZ;
                } else {
                    startPosZ = startZ;
                    endPosZ = endZ;
                }
            } else {
                startPosZ = startZ;
                endPosZ = endZ;
            }
    
            doorPosXStart = startPosX;
            doorPosXEnd = endPosX;
            doorPosZStart = startPosZ;
            doorPosZEnd = endPosZ;
        }
    
        const intersectedRooms = new Set();
    
        const corridorKey = `${roomA.x.toFixed(1)},${roomA.z.toFixed(1)}-${roomB.x.toFixed(1)},${roomB.z.toFixed(1)}-${doorDirection}`;
    
        if (!this.corridorConnections) {
            this.corridorConnections = new Set();
        }
    
        if (this.corridorConnections.has(corridorKey)) {
            return;
        }
    
        this.corridorConnections.add(corridorKey);
    
        if (
            roomA.doors.includes(doorDirection) ||
            roomB.doors.includes(this.getOppositeDirection(doorDirection))
        ) {
            return;
        }
    
        const segments = [];
        const testAndAddSegment = (segment) => {
            let validSegment = true;
    
            for (const room of this.rooms) {
                if (room === roomA || room === roomB) continue;
                if (this.intersectsCorridor(room, segment)) {
                    intersectedRooms.add(room);
                }
            }
    
            for (const corridor of this.corridors) {
                if (this.corridorSegmentsOverlap(segment, corridor)) {
                    if (this.getOverlapPercentage(segment, corridor) > 0.5) {
                        validSegment = false;
                        break;
                    }
                }
            }
    
            if (validSegment) {
                segments.push(segment);
            }
            return validSegment;
        };
    
        let corridorStyle = "direct";
        const dx = Math.abs(startPosX - endPosX);
        const dz = Math.abs(startPosZ - endPosZ);
    
        if (dx > 0.5 && dz > 0.5) {
            corridorStyle = "L-shaped";
        }
    
        if (corridorStyle === "direct") {
            let segment;
            if (dx > dz) {
                segment = this.createCorridorSegment(
                    startPosX,
                    startPosZ,
                    endPosX,
                    startPosZ,
                    "horizontal",
                    corridorMaterial,
                    height,
                );
            } else {
                segment = this.createCorridorSegment(
                    startPosX,
                    startPosZ,
                    startPosX,
                    endPosZ,
                    "vertical",
                    corridorMaterial,
                    height,
                );
            }
    
            if (testAndAddSegment(segment)) {
                if (dx > 0.5 && dz > 0.5) {
                    const connectionSegment =
                        dx > dz
                            ? this.createCorridorSegment(
                                  endPosX,
                                  startPosZ,
                                  endPosX,
                                  endPosZ,
                                  "vertical",
                                  corridorMaterial,
                                  height,
                              )
                            : this.createCorridorSegment(
                                  startPosX,
                                  endPosZ,
                                  endPosX,
                                  endPosZ,
                                  "horizontal",
                                  corridorMaterial,
                                  height,
                              );
                    testAndAddSegment(connectionSegment);
                }
            } else {
                corridorStyle = "L-shaped";
            }
        }
    
        if (corridorStyle === "L-shaped") {
            segments.length = 0;
    
            if (dx > dz) {
                const segment1 = this.createCorridorSegment(
                    startPosX,
                    startPosZ,
                    endPosX,
                    startPosZ,
                    "horizontal",
                    corridorMaterial,
                    height,
                );
                const segment2 = this.createCorridorSegment(
                    endPosX,
                    startPosZ,
                    endPosX,
                    endPosZ,
                    "vertical",
                    corridorMaterial,
                    height,
                );
    
                const valid1 = testAndAddSegment(segment1);
                const valid2 = testAndAddSegment(segment2);
    
                if (!valid1 || !valid2) {
                    segments.length = 0;
                    const alt1 = this.createCorridorSegment(
                        startPosX,
                        startPosZ,
                        startPosX,
                        endPosZ,
                        "vertical",
                        corridorMaterial,
                        height,
                    );
                    const alt2 = this.createCorridorSegment(
                        startPosX,
                        endPosZ,
                        endPosX,
                        endPosZ,
                        "horizontal",
                        corridorMaterial,
                        height,
                    );
    
                    testAndAddSegment(alt1);
                    testAndAddSegment(alt2);
                }
            } else {
                const segment1 = this.createCorridorSegment(
                    startPosX,
                    startPosZ,
                    startPosX,
                    endPosZ,
                    "vertical",
                    corridorMaterial,
                    height,
                );
                const segment2 = this.createCorridorSegment(
                    startPosX,
                    endPosZ,
                    endPosX,
                    endPosZ,
                    "horizontal",
                    corridorMaterial,
                    height,
                );
    
                const valid1 = testAndAddSegment(segment1);
                const valid2 = testAndAddSegment(segment2);
    
                if (!valid1 || !valid2) {
                    segments.length = 0;
                    const alt1 = this.createCorridorSegment(
                        startPosX,
                        startPosZ,
                        endPosX,
                        startPosZ,
                        "horizontal",
                        corridorMaterial,
                        height,
                    );
                    const alt2 = this.createCorridorSegment(
                        endPosX,
                        startPosZ,
                        endPosX,
                        endPosZ,
                        "vertical",
                        corridorMaterial,
                        height,
                    );
    
                    testAndAddSegment(alt1);
                    testAndAddSegment(alt2);
                }
            }
        }
    
        // Verificar que los segmentos no se incrusten en habitaciones
        segments.forEach(segment => {
            segment.walls.forEach(wall => {
                const wallBox = new THREE.Box3().setFromObject(wall.mesh);
                let isValid = true;
                for (const room of this.rooms) {
                    const roomBox = new THREE.Box3().setFromCenterAndSize(
                        new THREE.Vector3(room.x, height / 2, room.z),
                        new THREE.Vector3(room.width, height, room.depth)
                    );
                    if (wallBox.intersectsBox(roomBox)) {
                        const overlap = this.calculateOverlap(wallBox, roomBox, wall.direction);
                        if (overlap && overlap.amount > 0.5) {
                            isValid = false;
                            break;
                        }
                    }
                }
                if (!isValid) {
                    this.renderer.removeFromScene(wall.mesh);
                    if (wall.mesh.geometry) wall.mesh.geometry.dispose();
                }
            });
            segment.walls = segment.walls.filter(wall => {
                const wallBox = new THREE.Box3().setFromObject(wall.mesh);
                return this.rooms.every(room => {
                    const roomBox = new THREE.Box3().setFromCenterAndSize(
                        new THREE.Vector3(room.x, height / 2, room.z),
                        new THREE.Vector3(room.width, height, room.depth)
                    );
                    const overlap = this.calculateOverlap(wallBox, roomBox, wall.direction);
                    return !overlap || overlap.amount <= 0.5;
                });
            });
        });
    
        if (segments.length > 0) {
            this.mergeCorridorSegments(segments);
            segments.forEach((segment) => this.corridors.push(segment));
    
            const corridorStartPos = {
                x: segments[0].floor.position.x,
                z: segments[0].floor.position.z,
            };
            const corridorEndPos = {
                x: segments[segments.length - 1].floor.position.x,
                z: segments[segments.length - 1].floor.position.z,
            };
    
            this.openDoor(roomA, doorDirection, doorWidth, corridorStartPos);
            this.openDoor(
                roomB,
                this.getOppositeDirection(doorDirection),
                doorWidth,
                corridorEndPos,
            );
            roomA.doors.push(doorDirection);
            roomB.doors.push(this.getOppositeDirection(doorDirection));
    
            this.doorPositions.add(`${doorPosXStart},${doorPosZStart}`);
            this.doorPositions.add(`${doorPosXEnd},${doorPosZEnd}`);
    
            const maxDoorsPerRoom = 2;
            const doorsAdded = new Map();
    
            intersectedRooms.forEach((room) => {
                if (
                    room.doors.length >= maxDoorsPerRoom ||
                    doorsAdded.get(room) >= 1
                ) {
                    return;
                }
    
                let closestSegment = segments[0];
                let minDist = Infinity;
    
                for (const segment of segments) {
                    const dist = Math.sqrt(
                        (segment.floor.position.x - room.x) ** 2 +
                            (segment.floor.position.z - room.z) ** 2,
                    );
                    if (dist < minDist) {
                        minDist = dist;
                        closestSegment = segment;
                    }
                }
    
                const dirToRoom = this.getClosestDirection(
                    {
                        x: closestSegment.floor.position.x,
                        z: closestSegment.floor.position.z,
                    },
                    room,
                );
    
                if (!room.doors.includes(dirToRoom)) {
                    const doorPos = this.calculateDoorPosition(
                        room,
                        closestSegment,
                        dirToRoom,
                    );
    
                    let tooClose = false;
                    for (const doorPosStr of this.doorPositions) {
                        const [existingX, existingZ] = doorPosStr
                            .split(",")
                            .map(Number);
                        const doorDist = Math.sqrt(
                            (doorPos.x - existingX) ** 2 +
                                (doorPos.z - existingZ) ** 2,
                        );
                        if (doorDist < this.corridorWidth * 1.5) {
                            tooClose = true;
                            break;
                        }
                    }
    
                    if (!tooClose) {
                        this.openDoor(room, dirToRoom, this.corridorWidth * 0.8, doorPos);
                        doorsAdded.set(room, (doorsAdded.get(room) || 0) + 1);
                    }
                }
            });
        }
    }

    // Helper to calculate the best door position where corridor intersects room
    calculateDoorPosition(room, corridorSegment, direction) {
        const isVertical =
            corridorSegment.walls[0].direction === "east" ||
            corridorSegment.walls[0].direction === "west";

        // Base position is the corridor segment position
        const segmentX = corridorSegment.floor.position.x;
        const segmentZ = corridorSegment.floor.position.z;

        // Calculate room bounds
        const roomLeft = room.x - room.width / 2;
        const roomRight = room.x + room.width / 2;
        const roomTop = room.z - room.depth / 2;
        const roomBottom = room.z + room.depth / 2;

        let doorX = segmentX;
        let doorZ = segmentZ;

        // Adjust door position to be exactly at the room boundary
        if (direction === "north") {
            doorZ = roomTop;
        } else if (direction === "south") {
            doorZ = roomBottom;
        } else if (direction === "west") {
            doorX = roomLeft;
        } else if (direction === "east") {
            doorX = roomRight;
        }

        // If corridor is vertical, constrain X to corridor
        if (isVertical) {
            doorX = segmentX;
        } else {
            doorZ = segmentZ;
        }

        return { x: doorX, z: doorZ };
    }

    // Helper method to merge adjacent corridor segments
    mergeCorridorSegments(segments) {
        for (let i = 0; i < segments.length - 1; i++) {
            const curr = segments[i];
            const next = segments[i + 1];

            if (
                !curr ||
                !curr.walls ||
                !curr.walls[0] ||
                !next ||
                !next.walls ||
                !next.walls[0]
            ) {
                continue;
            }

            const currIsVertical =
                curr.walls[0].direction === "east" ||
                curr.walls[0].direction === "west";
            const nextIsVertical =
                next.walls[0].direction === "east" ||
                next.walls[0].direction === "west";

            if (currIsVertical === nextIsVertical) {
                const currX = curr.floor.position.x;
                const currZ = curr.floor.position.z;
                const nextX = next.floor.position.x;
                const nextZ = next.floor.position.z;

                const corridorMaterial = curr.walls[0].mesh.material;
                let newSegment;

                if (currIsVertical) {
                    const minZ = Math.min(
                        currZ - curr.floor.geometry.parameters.height / 2,
                        nextZ - next.floor.geometry.parameters.height / 2,
                    );
                    const maxZ = Math.max(
                        currZ + curr.floor.geometry.parameters.height / 2,
                        nextZ + next.floor.geometry.parameters.height / 2,
                    );
                    const midZ = (minZ + maxZ) / 2;
                    const height = maxZ - minZ;

                    newSegment = this.createCorridorSegment(
                        currX,
                        minZ,
                        currX,
                        maxZ,
                        "vertical",
                        corridorMaterial,
                        5,
                    );

                    newSegment.floor.geometry = new THREE.PlaneGeometry(
                        this.corridorWidth,
                        height,
                    );
                    newSegment.ceiling.geometry = new THREE.PlaneGeometry(
                        this.corridorWidth,
                        height,
                    );
                } else {
                    const minX = Math.min(
                        currX - curr.floor.geometry.parameters.width / 2,
                        nextX - next.floor.geometry.parameters.width / 2,
                    );
                    const maxX = Math.max(
                        currX + curr.floor.geometry.parameters.width / 2,
                        nextX + next.floor.geometry.parameters.width / 2,
                    );
                    const midX = (minX + maxX) / 2;
                    const width = maxX - minX;

                    newSegment = this.createCorridorSegment(
                        minX,
                        currZ,
                        maxX,
                        currZ,
                        "horizontal",
                        corridorMaterial,
                        5,
                    );

                    newSegment.floor.geometry = new THREE.PlaneGeometry(
                        width,
                        this.corridorWidth,
                    );
                    newSegment.ceiling.geometry = new THREE.PlaneGeometry(
                        width,
                        this.corridorWidth,
                    );
                }

                segments.splice(i, 2, newSegment);
                i--;
            }
        }
    }

    // New helper method to find path between points (A* inspired)
    findPathBetweenPoints(start, end, material, height) {
        const segments = [];
        const dx = end.x - start.x;
        const dz = end.z - start.z;

        // Decide if we should go horizontal or vertical first
        if (Math.abs(dx) > Math.abs(dz)) {
            // Go horizontal first
            const segment1 = this.createCorridorSegment(
                start.x,
                start.z,
                end.x,
                start.z,
                "horizontal",
                material,
                height,
            );
            const segment2 = this.createCorridorSegment(
                end.x,
                start.z,
                end.x,
                end.z,
                "vertical",
                material,
                height,
            );
            segments.push(segment1, segment2);
        } else {
            // Go vertical first
            const segment1 = this.createCorridorSegment(
                start.x,
                start.z,
                start.x,
                end.z,
                "vertical",
                material,
                height,
            );
            const segment2 = this.createCorridorSegment(
                start.x,
                end.z,
                end.x,
                end.z,
                "horizontal",
                material,
                height,
            );
            segments.push(segment1, segment2);
        }

        return segments;
    }

    // New helper method to check if corridor segments overlap
    corridorSegmentsOverlap(segment1, segment2) {
        const bounds1 = this.getCorridorBounds(segment1);
        const bounds2 = this.getCorridorBounds(segment2);

        return !(
            bounds1.maxX < bounds2.minX ||
            bounds1.minX > bounds2.maxX ||
            bounds1.maxZ < bounds2.minZ ||
            bounds1.minZ > bounds2.maxZ
        );
    }

    // New helper method to get corridor bounds
    getCorridorBounds(corridor) {
        const floor = corridor.floor;
        const width = floor.geometry.parameters.width;
        const depth = floor.geometry.parameters.height;
        const x = floor.position.x;
        const z = floor.position.z;

        return {
            minX: x - width / 2,
            maxX: x + width / 2,
            minZ: z - depth / 2,
            maxZ: z + depth / 2,
        };
    }

    // New helper method to calculate overlap percentage
    getOverlapPercentage(segment1, segment2) {
        const bounds1 = this.getCorridorBounds(segment1);
        const bounds2 = this.getCorridorBounds(segment2);

        const overlapX = Math.max(
            0,
            Math.min(bounds1.maxX, bounds2.maxX) -
            Math.max(bounds1.minX, bounds2.minX),
        );
        const overlapZ = Math.max(
            0,
            Math.min(bounds1.maxZ, bounds2.maxZ) -
            Math.max(bounds1.minZ, bounds2.minZ),
        );

        const area1 =
            (bounds1.maxX - bounds1.minX) * (bounds1.maxZ - bounds1.minZ);
        const overlapArea = overlapX * overlapZ;

        return overlapArea / area1;
    }

    removeWallExcess() {
        const height = 5;
        const wallsToProcess = [];

        this.corridors.forEach((corridor) => {
            if (!corridor.floor || !corridor.floor.geometry) return;

            const corridorBox = new THREE.Box3().setFromCenterAndSize(
                new THREE.Vector3(
                    corridor.floor.position.x,
                    height / 2,
                    corridor.floor.position.z,
                ),
                new THREE.Vector3(
                    corridor.floor.geometry.parameters.width,
                    height,
                    corridor.floor.geometry.parameters.height ||
                    corridor.floor.geometry.parameters.depth,
                ),
            );

            this.rooms.forEach((room) => {
                room.walls.forEach((wall) => {
                    if (!wall.mesh) return;

                    const wallBox = new THREE.Box3().setFromObject(wall.mesh);
                    // Solo eliminar paredes de salas si están completamente dentro del pasillo y hay una puerta en esa dirección
                    if (corridorBox.containsBox(wallBox)) {
                        const direction = wall.direction.replace("_left", "").replace("_right", "");
                        if (!room.doors.includes(direction)) {
                            // No eliminar la pared si no hay puerta, para evitar huecos
                            return;
                        }
                        wallsToProcess.push({
                            wall: wall,
                            container: room,
                            action: "remove",
                        });
                    } else if (wallBox.intersectsBox(corridorBox)) {
                        const overlap = this.calculateOverlap(
                            wallBox,
                            corridorBox,
                            wall.direction,
                        );
                        if (overlap) {
                            wallsToProcess.push({
                                wall: wall,
                                container: room,
                                action: "trim",
                                overlap: overlap,
                            });
                        }
                    }
                });
            });

            this.corridors.forEach((otherCorridor) => {
                if (otherCorridor === corridor || !otherCorridor.walls) return;

                otherCorridor.walls.forEach((wall) => {
                    if (!wall.mesh) return;

                    const wallBox = new THREE.Box3().setFromObject(wall.mesh);
                    if (corridorBox.containsBox(wallBox)) {
                        wallsToProcess.push({
                            wall: wall,
                            container: otherCorridor,
                            action: "remove",
                        });
                    } else if (wallBox.intersectsBox(corridorBox)) {
                        const overlap = this.calculateOverlap(
                            wallBox,
                            corridorBox,
                            wall.direction,
                        );
                        if (overlap) {
                            wallsToProcess.push({
                                wall: wall,
                                container: otherCorridor,
                                action: "trim",
                                overlap: overlap,
                            });
                        }
                    }
                });
            });

            if (corridor.walls) {
                corridor.walls.forEach((wall) => {
                    if (!wall.mesh) return;

                    const wallBox = new THREE.Box3().setFromObject(wall.mesh);

                    this.rooms.forEach((room) => {
                        const roomBox = new THREE.Box3().setFromCenterAndSize(
                            new THREE.Vector3(room.x, height / 2, room.z),
                            new THREE.Vector3(room.width, height, room.depth),
                        );

                        if (roomBox.containsBox(wallBox)) {
                            wallsToProcess.push({
                                wall: wall,
                                container: corridor,
                                action: "remove",
                            });
                        } else if (wallBox.intersectsBox(roomBox)) {
                            const overlap = this.calculateOverlap(
                                wallBox,
                                roomBox,
                                wall.direction,
                            );
                            if (overlap) {
                                wallsToProcess.push({
                                    wall: wall,
                                    container: corridor,
                                    action: "trim",
                                    overlap: overlap,
                                });
                            }
                        }
                    });
                });
            }
        });

        wallsToProcess.forEach((item) => {
            if (item.action === "remove") {
                this.removeWall(item.wall, item.container);
            } else if (item.action === "trim") {
                this.trimWall(item.wall, item.overlap, item.container);
            }
        });

        this.cleanupTinyWallSegments();
        this.ensureWallsCoverRooms();
    }

    ensureWallsCoverRooms() {
        const height = 5;
        this.rooms.forEach((room) => {
            const directions = ["north", "south", "east", "west"];
            directions.forEach((direction) => {
                const hasWall = room.walls.some(wall =>
                    wall.direction === direction ||
                    wall.direction === `${direction}_left` ||
                    wall.direction === `${direction}_right`
                );
                const hasDoor = room.doors.includes(direction);

                if (!hasWall && !hasDoor) {
                    console.log(`Regenerating missing wall in direction ${direction} for room at ${room.x}, ${room.z}`);
                    const wallMaterial = new THREE.MeshBasicMaterial({
                        color: room.type === "boss" ? 0x880000 :
                            room.type === "shop" ? 0x008800 :
                                room.type === "secret" ? 0x444444 : 0x555555,
                        side: THREE.DoubleSide
                    });

                    const wallGeometry = new THREE.PlaneGeometry(
                        direction === "north" || direction === "south" ? room.width : room.depth,
                        height
                    );
                    const wall = new THREE.Mesh(wallGeometry, wallMaterial);

                    // Asegurar que la pared esté en el borde correcto de la habitación
                    if (direction === "north") {
                        wall.rotation.y = Math.PI;
                        wall.position.set(room.x, height / 2, room.z - room.depth / 2);
                    } else if (direction === "south") {
                        wall.position.set(room.x, height / 2, room.z + room.depth / 2);
                    } else if (direction === "east") {
                        wall.rotation.y = Math.PI / 2;
                        wall.position.set(room.x + room.width / 2, height / 2, room.z);
                    } else if (direction === "west") {
                        wall.rotation.y = -Math.PI / 2;
                        wall.position.set(room.x - room.width / 2, height / 2, room.z);
                    }

                    // Verificar que la pared no se incruste dentro de otra estructura
                    const wallBox = new THREE.Box3().setFromObject(wall);
                    let isValidPosition = true;
                    for (const otherRoom of this.rooms) {
                        if (otherRoom === room) continue;
                        const roomBox = new THREE.Box3().setFromCenterAndSize(
                            new THREE.Vector3(otherRoom.x, height / 2, otherRoom.z),
                            new THREE.Vector3(otherRoom.width, height, otherRoom.depth)
                        );
                        if (wallBox.intersectsBox(roomBox)) {
                            isValidPosition = false;
                            break;
                        }
                    }

                    if (isValidPosition) {
                        room.walls.push({ mesh: wall, direction });
                        this.renderer.addToScene(wall);
                    } else {
                        console.warn(`Could not place wall in direction ${direction} for room at ${room.x}, ${room.z} due to intersection`);
                    }
                }
            });
        });
    }

    trimWall(wall, overlap, container) {
        if (!wall || !wall.mesh || !wall.mesh.geometry) return;

        const wallWidth = wall.mesh.geometry.parameters.width;
        const wallHeight = wall.mesh.geometry.parameters.height;
        const material = wall.mesh.material;

        if (overlap.amount >= wallWidth * 0.9) {
            this.removeWall(wall, container);
            return;
        }

        const leftWidth = Math.max(
            0,
            overlap.min - wall.mesh.position[overlap.axis] + wallWidth / 2
        );
        const rightWidth = Math.max(
            0,
            wallWidth / 2 - (overlap.max - wall.mesh.position[overlap.axis])
        );

        const minWallSize = 0.5;
        let createdSegments = false;

        if (leftWidth > minWallSize) {
            const leftWall = new THREE.Mesh(
                new THREE.PlaneGeometry(leftWidth, wallHeight),
                material
            );
            leftWall.rotation.copy(wall.mesh.rotation);
            leftWall.position.copy(wall.mesh.position);
            leftWall.position[overlap.axis] -= wallWidth / 2 - leftWidth / 2;
            this.renderer.addToScene(leftWall);
            if (container && container.walls) {
                container.walls.push({
                    mesh: leftWall,
                    direction: `${wall.direction}_left`
                });
            }
            createdSegments = true;
        }

        if (rightWidth > minWallSize) {
            const rightWall = new THREE.Mesh(
                new THREE.PlaneGeometry(rightWidth, wallHeight),
                material
            );
            rightWall.rotation.copy(wall.mesh.rotation);
            rightWall.position.copy(wall.mesh.position);
            rightWall.position[overlap.axis] += wallWidth / 2 - rightWidth / 2;
            this.renderer.addToScene(rightWall);
            if (container && container.walls) {
                container.walls.push({
                    mesh: rightWall,
                    direction: `${wall.direction}_right`
                });
            }
            createdSegments = true;
        }

        this.removeWall(wall, container);

        if (!createdSegments && container && this.rooms.includes(container)) {
            const direction = wall.direction.replace("_left", "").replace("_right", "");
            if (["north", "south", "east", "west"].includes(direction)) {
                const doorWidth = this.corridorWidth * 0.8;
                const midX = (overlap.min + overlap.max) / 2;
                const midZ = wall.mesh.position.z;
                let corridorPos = null;

                for (const corridor of this.corridors) {
                    if (!corridor.floor) continue;
                    const dist = Math.sqrt(
                        (corridor.floor.position.x - midX) ** 2 +
                        (corridor.floor.position.z - midZ) ** 2
                    );
                    if (dist < this.corridorWidth) {
                        corridorPos = { x: midX, z: midZ };
                        break;
                    }
                }

                if (corridorPos && !container.doors.includes(direction)) {
                    this.openDoor(container, direction, doorWidth, corridorPos);
                } else {
                    const wallMaterial = new THREE.MeshBasicMaterial({
                        color: container.type === "boss" ? 0x880000 :
                            container.type === "shop" ? 0x008800 :
                                container.type === "secret" ? 0x444444 : 0x555555,
                        side: THREE.DoubleSide
                    });

                    const newWall = new THREE.Mesh(
                        new THREE.PlaneGeometry(wallWidth, wallHeight),
                        wallMaterial
                    );
                    newWall.rotation.copy(wall.mesh.rotation);
                    newWall.position.copy(wall.mesh.position);
                    this.renderer.addToScene(newWall);
                    container.walls.push({
                        mesh: newWall,
                        direction: direction
                    });
                }
            }
        }
    }

    removeWall(wall, container) {
        if (!wall || !wall.mesh) return;

        this.renderer.removeFromScene(wall.mesh);
        if (wall.mesh.geometry) wall.mesh.geometry.dispose();

        if (container && container.walls) {
            container.walls = container.walls.filter((w) => w !== wall);
        }
    }

    // Helper to clean up tiny wall segments that might cause visual artifacts
    cleanupTinyWallSegments() {
        const minValidSize = 0.5;

        // Process room walls
        this.rooms.forEach((room) => {
            const wallsToRemove = [];

            room.walls.forEach((wall) => {
                if (!wall.mesh || !wall.mesh.geometry) return;

                const width = wall.mesh.geometry.parameters.width;
                if (width < minValidSize) {
                    wallsToRemove.push(wall);
                }
            });

            wallsToRemove.forEach((wall) => this.removeWall(wall, room));
        });

        // Process corridor walls
        this.corridors.forEach((corridor) => {
            if (!corridor.walls) return;

            const wallsToRemove = [];

            corridor.walls.forEach((wall) => {
                if (!wall.mesh || !wall.mesh.geometry) return;

                const width = wall.mesh.geometry.parameters.width;
                if (width < minValidSize) {
                    wallsToRemove.push(wall);
                }
            });

            wallsToRemove.forEach((wall) => this.removeWall(wall, corridor));
        });
    }

    connectRoomsWithKruskal() {
        const parent = new Map();
        const rank = new Map();

        const makeSet = (room) => {
            parent.set(room, room);
            rank.set(room, 0);
        };

        const find = (room) => {
            if (parent.get(room) !== room) {
                parent.set(room, find(parent.get(room)));
            }
            return parent.get(room);
        };

        const union = (roomA, roomB) => {
            const rootA = find(roomA);
            const rootB = find(roomB);
            if (rootA === rootB) return false;
            if (rank.get(rootA) < rank.get(rootB)) {
                parent.set(rootA, rootB);
            } else {
                parent.set(rootB, rootA);
                if (rank.get(rootA) === rank.get(rootB)) {
                    rank.set(rootA, rank.get(rootA) + 1);
                }
            }
            return true;
        };

        this.rooms.forEach((room) => makeSet(room));

        const startRoom = this.rooms.find(r => r.type === "start");
        const bossRoom = this.rooms.find(r => r.type === "boss");
        const largestRoom = this.largestRoom;

        const normalMaxDoors = 3;
        const largeRoomMaxDoors = 5;

        const getMaxDoorsForRoom = (room) => {
            if (room === largestRoom) return largeRoomMaxDoors;
            if (room?.type === "start") return 4;
            if (room?.type === "boss") return 2;
            if (room?.type === "secret") return 1;
            if (room?.type === "shop") return 2;
            return normalMaxDoors;
        };

        const edges = [];
        for (let i = 0; i < this.rooms.length; i++) {
            for (let j = i + 1; j < this.rooms.length; j++) {
                const roomA = this.rooms[i];
                const roomB = this.rooms[j];

                const maxConnectDistance = this.mapWidth / 3;
                const dx = Math.abs(roomA.x - roomB.x);
                const dz = Math.abs(roomA.z - roomB.z);
                const manhattanDist = dx + dz;

                if (manhattanDist > maxConnectDistance) continue;

                const euclideanDist = Math.sqrt(dx * dx + dz * dz);
                const dist = manhattanDist * 0.7 + euclideanDist * 0.3;

                const direction = this.getClosestDirection(roomA, roomB);
                const isAdjacent =
                    dx < roomA.width / 2 + roomB.width / 2 + 0.5 &&
                    dz < roomA.depth / 2 + roomB.depth / 2 + 0.5;

                const hasLineOfSight = this.hasLineOfSight(roomA, roomB);

                const largeRoomBonus = (roomA === largestRoom || roomB === largestRoom) ? 2 : 0;
                const startBossBonus = (roomA === startRoom || roomB === startRoom || roomA === bossRoom || roomB === bossRoom) ? 1 : 0;

                edges.push({
                    from: roomA,
                    to: roomB,
                    distance: dist,
                    direction,
                    isAdjacent,
                    hasLineOfSight,
                    priority: this.getRoomConnectionPriority(roomA, roomB) + largeRoomBonus + startBossBonus
                });
            }
        }

        edges.sort((a, b) => {
            if (a.priority !== b.priority) return b.priority - a.priority;
            if (a.hasLineOfSight !== b.hasLineOfSight) return a.hasLineOfSight ? -1 : 1;
            return a.distance - b.distance;
        });

        const connections = new Map();
        const doorCounts = new Map();
        const roomConnections = new Map();
        this.rooms.forEach((room) => {
            doorCounts.set(room, 0);
            roomConnections.set(room, new Set());
            if (!room.doors) room.doors = [];
        });

        for (const edge of edges) {
            const roomA = edge.from;
            const roomB = edge.to;

            if (roomConnections.get(roomA).has(roomB) || roomConnections.get(roomB).has(roomA)) {
                continue;
            }

            if (doorCounts.get(roomA) >= getMaxDoorsForRoom(roomA) &&
                doorCounts.get(roomB) >= getMaxDoorsForRoom(roomB)) {
                continue;
            }

            if (find(roomA) === find(roomB) && edge.priority <= 2) {
                continue;
            }

            const key = `${Math.min(this.rooms.indexOf(roomA), this.rooms.indexOf(roomB))}-${Math.max(this.rooms.indexOf(roomA), this.rooms.indexOf(roomB))}`;
            if (connections.has(key)) continue;

            if (edge.isAdjacent) {
                this.connectWithDoor(roomA, roomB, edge.direction);
                doorCounts.set(roomA, doorCounts.get(roomA) + 1);
                doorCounts.set(roomB, doorCounts.get(roomB) + 1);
            } else {
                if (this.hasIndirectPath(roomA, roomB, connections)) {
                    continue;
                }

                this.createCorridor(roomA, roomB, edge.direction);
                doorCounts.set(roomA, doorCounts.get(roomA) + 1);
                doorCounts.set(roomB, doorCounts.get(roomB) + 1);
            }

            roomConnections.get(roomA).add(roomB);
            roomConnections.get(roomB).add(roomA);

            union(roomA, roomB);
            connections.set(key, true);
        }

        const extraConnectionCount = Math.floor(this.rooms.length * 0.05);
        let extraConnections = 0;

        edges.sort((a, b) => a.distance - b.distance);

        for (const edge of edges) {
            if (extraConnections >= extraConnectionCount) break;

            const roomA = edge.from;
            const roomB = edge.to;

            if (roomConnections.get(roomA).has(roomB) || roomConnections.get(roomB).has(roomA)) {
                continue;
            }

            if (doorCounts.get(roomA) >= getMaxDoorsForRoom(roomA) ||
                doorCounts.get(roomB) >= getMaxDoorsForRoom(roomB)) {
                continue;
            }

            const key = `${Math.min(this.rooms.indexOf(roomA), this.rooms.indexOf(roomB))}-${Math.max(this.rooms.indexOf(roomA), this.rooms.indexOf(roomB))}`;
            if (connections.has(key)) continue;

            if (this.hasShortIndirectPath(roomA, roomB, connections)) {
                continue;
            }

            if (edge.isAdjacent) {
                const direction = edge.direction;
                if (!roomA.doors.includes(direction) &&
                    !roomB.doors.includes(this.getOppositeDirection(direction))) {
                    this.connectWithDoor(roomA, roomB, direction);
                    connections.set(key, true);
                    doorCounts.set(roomA, doorCounts.get(roomA) + 1);
                    doorCounts.set(roomB, doorCounts.get(roomB) + 1);
                    roomConnections.get(roomA).add(roomB);
                    roomConnections.get(roomB).add(roomA);
                    extraConnections++;
                }
            } else {
                if (edge.distance < this.maxRoomSize * 1.5 && edge.hasLineOfSight) {
                    this.createCorridor(roomA, roomB, edge.direction);
                    connections.set(key, true);
                    doorCounts.set(roomA, doorCounts.get(roomA) + 1);
                    doorCounts.set(roomB, doorCounts.get(roomB) + 1);
                    roomConnections.get(roomA).add(roomB);
                    roomConnections.get(roomB).add(roomA);
                    extraConnections++;
                }
            }
        }

        if (startRoom && doorCounts.get(startRoom) < 2) {
            const potentialRooms = this.rooms
                .filter(r => r !== startRoom && doorCounts.get(r) < getMaxDoorsForRoom(r) && !roomConnections.get(startRoom).has(r))
                .map(r => ({
                    room: r,
                    dist: Math.sqrt((startRoom.x - r.x) ** 2 + (startRoom.z - r.z) ** 2),
                    priority: this.getRoomConnectionPriority(startRoom, r)
                }))
                .sort((a, b) => b.priority - a.priority || a.dist - b.dist);

            let additionalConnections = 0;
            for (const { room } of potentialRooms) {
                if (doorCounts.get(startRoom) >= 2) break;
                if (additionalConnections >= 1) break;

                const key = `${Math.min(this.rooms.indexOf(startRoom), this.rooms.indexOf(room))}-${Math.max(this.rooms.indexOf(startRoom), this.rooms.indexOf(room))}`;
                if (connections.has(key)) continue;

                const direction = this.getClosestDirection(startRoom, room);
                if (this.hasShortIndirectPath(startRoom, room, connections)) continue;

                this.createCorridor(startRoom, room, direction);
                connections.set(key, true);
                doorCounts.set(startRoom, doorCounts.get(startRoom) + 1);
                doorCounts.set(room, doorCounts.get(room) + 1);
                roomConnections.get(startRoom).add(room);
                roomConnections.get(room).add(startRoom);
                additionalConnections++;
            }
        }

        if (largestRoom && doorCounts.get(largestRoom) < 3) {
            const potentialRooms = this.rooms
                .filter(r => r !== largestRoom && doorCounts.get(r) < getMaxDoorsForRoom(r) && !roomConnections.get(largestRoom).has(r))
                .map(r => ({
                    room: r,
                    dist: Math.sqrt((largestRoom.x - r.x) ** 2 + (largestRoom.z - r.z) ** 2),
                    priority: this.getRoomConnectionPriority(largestRoom, r)
                }))
                .sort((a, b) => b.priority - a.priority || a.dist - b.dist);

            let additionalConnections = 0;
            for (const { room } of potentialRooms) {
                if (doorCounts.get(largestRoom) >= 3) break;
                if (additionalConnections >= 2) break;

                const key = `${Math.min(this.rooms.indexOf(largestRoom), this.rooms.indexOf(room))}-${Math.max(this.rooms.indexOf(largestRoom), this.rooms.indexOf(room))}`;
                if (connections.has(key)) continue;

                const direction = this.getClosestDirection(largestRoom, room);
                if (this.hasShortIndirectPath(largestRoom, room, connections)) continue;

                this.createCorridor(largestRoom, room, direction);
                connections.set(key, true);
                doorCounts.set(largestRoom, doorCounts.get(largestRoom) + 1);
                doorCounts.set(room, doorCounts.get(room) + 1);
                roomConnections.get(largestRoom).add(room);
                roomConnections.get(room).add(largestRoom);
                additionalConnections++;
            }
        }
    }

    // Helper to check if there's a line of sight between rooms
    hasLineOfSight(roomA, roomB) {
        // Simple check - see if there are other rooms between these two
        const midX = (roomA.x + roomB.x) / 2;
        const midZ = (roomA.z + roomB.z) / 2;

        for (const room of this.rooms) {
            if (room === roomA || room === roomB) continue;

            // Check if this room is between roomA and roomB
            // by seeing if it's near the midpoint of the line between them
            const distToMid = Math.sqrt(
                (room.x - midX) ** 2 + (room.z - midZ) ** 2,
            );
            const roomSize =
                Math.sqrt(room.width * room.width + room.depth * room.depth) /
                2;

            if (distToMid < roomSize) {
                return false; // Room blocks line of sight
            }
        }

        return true;
    }

    // Helper to check if rooms are already indirectly connected
    hasIndirectPath(roomA, roomB, connections) {
        // Create an adjacency list of the current graph
        const graph = new Map();
        this.rooms.forEach((room) => graph.set(room, []));

        for (let i = 0; i < this.rooms.length; i++) {
            for (let j = i + 1; j < this.rooms.length; j++) {
                const r1 = this.rooms[i];
                const r2 = this.rooms[j];
                const key = `${i}-${j}`;

                if (connections.has(key)) {
                    graph.get(r1).push(r2);
                    graph.get(r2).push(r1);
                }
            }
        }

        // BFS to find if there's a path, with a limit on path length
        const queue = [{ room: roomA, distance: 0 }];
        const visited = new Set([roomA]);
        const maxPathLength = 3; // Limit how indirect the path can be

        while (queue.length > 0) {
            const { room, distance } = queue.shift();

            if (room === roomB) {
                return true; // Found a path
            }

            if (distance >= maxPathLength) {
                continue; // Path too long
            }

            for (const neighbor of graph.get(room)) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push({ room: neighbor, distance: distance + 1 });
                }
            }
        }

        return false; // No path found
    }

    // Check for a short indirect path (just one intermediate room)
    hasShortIndirectPath(roomA, roomB, connections) {
        // Create an adjacency list of the current graph
        const graph = new Map();
        this.rooms.forEach((room) => graph.set(room, []));

        for (let i = 0; i < this.rooms.length; i++) {
            for (let j = i + 1; j < this.rooms.length; j++) {
                const r1 = this.rooms[i];
                const r2 = this.rooms[j];
                const key = `${i}-${j}`;

                if (connections.has(key)) {
                    graph.get(r1).push(r2);
                    graph.get(r2).push(r1);
                }
            }
        }

        // Check if there's a path with exactly one intermediate room
        for (const intermediate of this.rooms) {
            if (intermediate === roomA || intermediate === roomB) continue;

            const aToIntermediate = graph.get(roomA).includes(intermediate);
            const intermediateToB = graph.get(intermediate).includes(roomB);

            if (aToIntermediate && intermediateToB) {
                return true; // There's a path A -> Intermediate -> B
            }
        }

        return false;
    }

    // Helper method to determine connection priority between rooms
    getRoomConnectionPriority(roomA, roomB) {
        // Highest priority: connecting start room to others
        if (roomA.type === "start" || roomB.type === "start") {
            return 5;
        }

        // High priority: connecting to boss room (but not directly from start)
        if (
            (roomA.type === "boss" && roomB.type !== "start") ||
            (roomB.type === "boss" && roomA.type !== "start")
        ) {
            return 4;
        }

        // Medium-high priority: connecting shop rooms to main path
        if (roomA.type === "shop" || roomB.type === "shop") {
            return 3;
        }

        // Medium priority: standard room connections
        if (roomA.type === "normal" && roomB.type === "normal") {
            return 2;
        }

        // Lower priority: connections involving secret rooms
        if (roomA.type === "secret" || roomB.type === "secret") {
            return 1;
        }

        // Default priority
        return 0;
    }

    ensureDoorConnection() {
        const unconnectedRooms = new Set(this.rooms);

        this.rooms.forEach((room) => {
            if (room.doors && room.doors.length > 0) {
                unconnectedRooms.delete(room);
            }
        });

        unconnectedRooms.forEach((room) => {
            console.log(`Finding connection for unconnected room at ${room.x}, ${room.z}`);
            let closestRoom = null;
            let closestDist = Infinity;

            for (const otherRoom of this.rooms) {
                if (otherRoom === room) continue;

                const dist = Math.sqrt(
                    (room.x - otherRoom.x) ** 2 +
                    (room.z - otherRoom.z) ** 2
                );

                if (dist < closestDist) {
                    closestDist = dist;
                    closestRoom = otherRoom;
                }
            }

            if (closestRoom) {
                const direction = this.getClosestDirection(room, closestRoom);
                console.log(`Connecting unconnected room to ${closestRoom.x}, ${closestRoom.z} in direction ${direction}`);
                this.createCorridor(room, closestRoom, direction);
                unconnectedRooms.delete(room);
            } else {
                console.warn("Could not find a room to connect to!");
            }
        });

        // Verificar que todas las salas estén conectadas
        const visited = new Set();
        const queue = [this.rooms[0]];
        visited.add(this.rooms[0]);

        while (queue.length > 0) {
            const room = queue.shift();
            for (const direction of room.doors) {
                const doorKey = direction === "north" ? `${room.x.toFixed(2)},${(room.z - room.depth / 2).toFixed(2)}` :
                    direction === "south" ? `${room.x.toFixed(2)},${(room.z + room.depth / 2).toFixed(2)}` :
                        direction === "east" ? `${(room.x + room.width / 2).toFixed(2)},${room.z.toFixed(2)}` :
                            `${(room.x - room.width / 2).toFixed(2)},${room.z.toFixed(2)}`;

                for (const otherRoom of this.rooms) {
                    if (otherRoom === room) continue;
                    if (visited.has(otherRoom)) continue;

                    const otherDoors = otherRoom.doors.map(dir => {
                        return dir === "north" ? `${otherRoom.x.toFixed(2)},${(otherRoom.z - otherRoom.depth / 2).toFixed(2)}` :
                            dir === "south" ? `${otherRoom.x.toFixed(2)},${(otherRoom.z + otherRoom.depth / 2).toFixed(2)}` :
                                dir === "east" ? `${(otherRoom.x + otherRoom.width / 2).toFixed(2)},${otherRoom.z.toFixed(2)}` :
                                    `${(otherRoom.x - otherRoom.width / 2).toFixed(2)},${otherRoom.z.toFixed(2)}`;
                    });

                    if (otherDoors.includes(doorKey)) {
                        visited.add(otherRoom);
                        queue.push(otherRoom);
                    }
                }
            }
        }

        this.rooms.forEach((room) => {
            if (!visited.has(room)) {
                console.log(`Room at ${room.x}, ${room.z} is not connected, connecting now...`);
                let closestRoom = null;
                let closestDist = Infinity;

                for (const otherRoom of this.rooms) {
                    if (otherRoom === room || !visited.has(otherRoom)) continue;

                    const dist = Math.sqrt(
                        (room.x - otherRoom.x) ** 2 +
                        (room.z - otherRoom.z) ** 2
                    );

                    if (dist < closestDist) {
                        closestDist = dist;
                        closestRoom = otherRoom;
                    }
                }

                if (closestRoom) {
                    const direction = this.getClosestDirection(room, closestRoom);
                    this.createCorridor(room, closestRoom, direction);
                }
            }
        });

        this.repairDisconnectedDoors();
    }

    repairDisconnectedDoors() {
        console.log("Repairing disconnected doors...");
        const minDistanceBetweenDoors = this.corridorWidth * 1.5;
        const processed = new Set();

        const allDoorData = [];
        this.rooms.forEach((room) => {
            if (!room.doors || room.doors.length === 0) return;

            room.doors.forEach((doorDirection) => {
                let doorPosX = room.x;
                let doorPosZ = room.z;

                if (doorDirection === "north") {
                    doorPosZ = room.z - room.depth / 2;
                } else if (doorDirection === "south") {
                    doorPosZ = room.z + room.depth / 2;
                } else if (doorDirection === "east") {
                    doorPosX = room.x + room.width / 2;
                } else if (doorDirection === "west") {
                    doorPosX = room.x - room.width / 2;
                }

                const doorKey = `${doorPosX.toFixed(2)},${doorPosZ.toFixed(2)}`;
                const isRegistered = this.doorPositions.has(doorKey);

                allDoorData.push({
                    room,
                    direction: doorDirection,
                    x: doorPosX,
                    z: doorPosZ,
                    isRegistered
                });
            });
        });

        for (const doorData of allDoorData) {
            const doorKey = `${doorData.x.toFixed(2)},${doorData.z.toFixed(2)}`;
            if (processed.has(doorKey)) continue;
            processed.add(doorKey);

            if (!doorData.isRegistered) {
                console.log(`Found disconnected door at ${doorKey} in direction ${doorData.direction}`);
                const potentialDestinations = [];

                for (const room of this.rooms) {
                    if (room === doorData.room) continue;

                    const dist = Math.sqrt(
                        (doorData.x - room.x) ** 2 +
                        (doorData.z - room.z) ** 2
                    );

                    if (dist > this.mapWidth / 2) continue;

                    let alreadyConnected = false;
                    for (const corridor of this.corridors) {
                        if (!corridor.floor) continue;
                        const corridorX = corridor.floor.position.x;
                        const corridorZ = corridor.floor.position.z;

                        const corridorToRoomDist = Math.sqrt(
                            (room.x - corridorX) ** 2 +
                            (room.z - corridorZ) ** 2
                        );
                        const doorToCorridorDist = Math.sqrt(
                            (doorData.x - corridorX) ** 2 +
                            (doorData.z - corridorZ) ** 2
                        );

                        const connectsRoomA = doorToCorridorDist < this.corridorWidth * 2;
                        const connectsRoomB = corridorToRoomDist < room.width / 2 + room.depth / 2;

                        if (connectsRoomA && connectsRoomB) {
                            alreadyConnected = true;
                            break;
                        }
                    }

                    if (!alreadyConnected) {
                        let score = 100 - dist;
                        const oppositeDir = this.getOppositeDirection(doorData.direction);
                        if (room.doors && room.doors.includes(oppositeDir)) {
                            score += 30;
                        }
                        score += (room.width * room.depth) / 200;
                        const doorCount = room.doors ? room.doors.length : 0;
                        score -= doorCount * 5;
                        if (room.type === "start") score += 25;
                        if (room.type === "boss") score += 15;
                        if (room.type === "shop") score += 10;

                        potentialDestinations.push({
                            room,
                            dist,
                            score
                        });
                    }
                }

                potentialDestinations.sort((a, b) => b.score - a.score);

                if (potentialDestinations.length > 0) {
                    const bestMatch = potentialDestinations[0].room;
                    console.log(`Found best match room at ${bestMatch.x}, ${bestMatch.z} with score ${potentialDestinations[0].score}`);
                    this.createCorridor(doorData.room, bestMatch, doorData.direction);
                    this.doorPositions.add(doorKey);
                } else {
                    console.log(`Could not find a suitable room to connect the door at ${doorKey}. Creating a new room...`);
                    const newRoomWidth = this.minRoomSize;
                    const newRoomDepth = this.minRoomSize;
                    let newRoomX = doorData.x;
                    let newRoomZ = doorData.z;

                    if (doorData.direction === "north") {
                        newRoomZ -= (doorData.room.depth / 2 + newRoomDepth / 2 + this.corridorWidth);
                    } else if (doorData.direction === "south") {
                        newRoomZ += (doorData.room.depth / 2 + newRoomDepth / 2 + this.corridorWidth);
                    } else if (doorData.direction === "east") {
                        newRoomX += (doorData.room.width / 2 + newRoomWidth / 2 + this.corridorWidth);
                    } else if (doorData.direction === "west") {
                        newRoomX -= (doorData.room.width / 2 + newRoomWidth / 2 + this.corridorWidth);
                    }

                    const newRoom = this.createRoom("normal", newRoomWidth, newRoomDepth, newRoomX, newRoomZ);
                    this.rooms.push(newRoom);
                    this.addRoomToScene(newRoom);
                    this.createCorridor(doorData.room, newRoom, doorData.direction);
                    this.doorPositions.add(doorKey);
                }
            }
        }

        this.cleanupRedundantDoors();
    }

    cleanupRedundantDoors() {
        // First find all valid door positions by analyzing corridors
        const validDoorPositions = new Set();

        this.corridors.forEach(corridor => {
            if (!corridor.floor) return;

            const corridorX = corridor.floor.position.x;
            const corridorZ = corridor.floor.position.z;
            const corridorWidth = corridor.floor.geometry.parameters.width || this.corridorWidth;
            const corridorDepth = corridor.floor.geometry.parameters.height || this.corridorWidth;

            // Add corridor ends as valid door positions
            // We'll use a slightly fuzzy position to account for floating point issues
            const positions = [
                { x: corridorX - corridorWidth / 2, z: corridorZ }, // Left
                { x: corridorX + corridorWidth / 2, z: corridorZ }, // Right
                { x: corridorX, z: corridorZ - corridorDepth / 2 }, // Top
                { x: corridorX, z: corridorZ + corridorDepth / 2 }  // Bottom
            ];

            positions.forEach(pos => {
                validDoorPositions.add(`${pos.x.toFixed(1)},${pos.z.toFixed(1)}`);
            });
        });

        // Now check each room's doors to ensure they connect to valid positions
        this.rooms.forEach(room => {
            if (!room.doors || room.doors.length === 0) return;

            const doorsToRemove = [];

            room.doors.forEach(doorDirection => {
                let doorPosX = room.x;
                let doorPosZ = room.z;

                if (doorDirection === "north") {
                    doorPosZ = room.z - room.depth / 2;
                } else if (doorDirection === "south") {
                    doorPosZ = room.z + room.depth / 2;
                } else if (doorDirection === "east") {
                    doorPosX = room.x + room.width / 2;
                } else if (doorDirection === "west") {
                    doorPosX = room.x - room.width / 2;
                }

                const doorKey = `${doorPosX.toFixed(1)},${doorPosZ.toFixed(1)}`;

                // Check if this door position is reasonably close to a valid position
                let isValid = false;
                for (const validPosKey of validDoorPositions) {
                    const [validX, validZ] = validPosKey.split(',').map(Number);
                    const dist = Math.sqrt((doorPosX - validX) ** 2 + (doorPosZ - validZ) ** 2);

                    if (dist < this.corridorWidth) {
                        isValid = true;
                        break;
                    }
                }

                if (!isValid) {
                    doorsToRemove.push(doorDirection);
                }
            });

            // Remove invalid doors
            doorsToRemove.forEach(direction => {
                console.log(`Removing invalid door in direction ${direction} from room at ${room.x}, ${room.z}`);
                room.doors = room.doors.filter(d => d !== direction);

                // We should also regenerate the wall for this direction
                const wallDir = direction.replace('_left', '').replace('_right', '');

                // Find any partial walls for this direction and remove them
                const wallsToRemove = room.walls.filter(wall =>
                    wall.direction.startsWith(wallDir) &&
                    (wall.direction.includes('_left') || wall.direction.includes('_right'))
                );

                wallsToRemove.forEach(wall => {
                    this.renderer.removeFromScene(wall.mesh);
                    if (wall.mesh.geometry) wall.mesh.geometry.dispose();
                });

                room.walls = room.walls.filter(wall =>
                    !wall.direction.startsWith(wallDir) ||
                    (!wall.direction.includes('_left') && !wall.direction.includes('_right'))
                );

                // Create a new complete wall
                const wallMaterial = new THREE.MeshBasicMaterial({
                    color: room.type === "boss" ? 0x880000 :
                        room.type === "shop" ? 0x008800 :
                            room.type === "secret" ? 0x444444 : 0x555555,
                    side: THREE.DoubleSide
                });

                let newWallWidth, newWallDepth;
                if (wallDir === "north" || wallDir === "south") {
                    newWallWidth = room.width;
                    newWallDepth = 5;  // Height
                } else {
                    newWallWidth = room.depth;
                    newWallDepth = 5;  // Height
                }

                const newWall = new THREE.Mesh(
                    new THREE.PlaneGeometry(newWallWidth, newWallDepth),
                    wallMaterial
                );

                // Position the wall correctly
                if (wallDir === "north") {
                    newWall.rotation.y = Math.PI;
                    newWall.position.set(room.x, newWallDepth / 2, room.z - room.depth / 2);
                } else if (wallDir === "south") {
                    newWall.position.set(room.x, newWallDepth / 2, room.z + room.depth / 2);
                } else if (wallDir === "east") {
                    newWall.rotation.y = Math.PI / 2;
                    newWall.position.set(room.x + room.width / 2, newWallDepth / 2, room.z);
                } else if (wallDir === "west") {
                    newWall.rotation.y = -Math.PI / 2;
                    newWall.position.set(room.x - room.width / 2, newWallDepth / 2, room.z);
                }

                room.walls.push({
                    mesh: newWall,
                    direction: wallDir
                });

                this.renderer.addToScene(newWall);
            });
        });
    }

    placePlayer() {
        let startRoom = this.rooms.find((room) => room.type === "start");

        if (!startRoom) {
            if (this.rooms.length > 0) {
                startRoom = this.rooms[0];
            } else {
                console.warn("No rooms found for player placement, creating emergency room");
                startRoom = this.createRoom("start", 10, 10, 0, 0);
                this.rooms.push(startRoom);
                this.addRoomToScene(startRoom);
            }
        }

        if (startRoom.width * startRoom.depth < 100) {
            const largerRooms = this.rooms
                .filter(r => r !== startRoom && r.width * r.depth >= 100)
                .sort((a, b) => (b.width * b.depth) - (a.width * a.depth));
            if (largerRooms.length > 0) {
                startRoom = largerRooms[0];
                startRoom.type = "start";
            }
        }

        const margin = Math.min(2, Math.min(startRoom.width, startRoom.depth) * 0.2);
        const safeWidth = Math.max(1, startRoom.width - 2 * margin);
        const safeDepth = Math.max(1, startRoom.depth - 2 * margin);

        const safeX = startRoom.x + (Math.random() * safeWidth - safeWidth / 2);
        const safeZ = startRoom.z + (Math.random() * safeDepth - safeDepth / 2);

        this.physics.player.mesh.position.set(safeX, 0.5, safeZ);
        console.log("Player placed in start room at:", safeX, safeZ);

        startRoom.visited = true;
    }

    setupMinimap() {
        this.minimapCanvas = document.createElement("canvas");
        this.minimapCanvas.id = "minimap";
        this.minimapCanvas.width = 200;
        this.minimapCanvas.height = 200;
        this.minimapCanvas.style.position = "absolute";
        this.minimapCanvas.style.top = "10px";
        this.minimapCanvas.style.right = "10px";
        this.minimapCanvas.style.border = "1px solid white";
        this.minimapCanvas.style.display = "none";
        document.body.appendChild(this.minimapCanvas);

        document.addEventListener("keydown", (event) => {
            if (event.key === "Tab") {
                event.preventDefault();
                this.minimapVisible = !this.minimapVisible;
                this.updateMinimap();
            }
        });
    }

    updateMinimap() {
        if (!this.minimapCanvas) return;

        const ctx = this.minimapCanvas.getContext("2d");
        ctx.clearRect(
            0,
            0,
            this.minimapCanvas.width,
            this.minimapCanvas.height,
        );

        if (!this.minimapVisible) {
            this.minimapCanvas.style.display = "none";
            return;
        }

        this.minimapCanvas.style.display = "block";
        ctx.fillStyle = "#222";
        ctx.fillRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);

        const scale = 5;
        const offsetX = this.minimapCanvas.width / 2;
        const offsetY = this.minimapCanvas.height / 2;

        this.rooms.forEach((room) => {
            ctx.fillStyle = room.visited
                ? room.type === "start"
                    ? "#00ff00"
                    : room.type === "boss"
                        ? "#ff0000"
                        : room.type === "secret"
                            ? "#444"
                            : "#555"
                : "#333";
            const x = room.x * scale + offsetX - (room.width * scale) / 2;
            const y = room.z * scale + offsetY - (room.depth * scale) / 2;
            ctx.fillRect(x, y, room.width * scale, room.depth * scale);
        });

        this.corridors.forEach((corridor) => {
            ctx.fillStyle = "#777";
            const midX =
                (corridor.walls && corridor.walls[0]
                    ? corridor.walls[0].mesh.position.x
                    : corridor.floor.position.x) *
                scale +
                offsetX;
            const midZ =
                (corridor.walls && corridor.walls[0]
                    ? corridor.walls[0].mesh.position.z
                    : corridor.floor.position.z) *
                scale +
                offsetY;
            const lengthX =
                (corridor.walls && corridor.walls[0]
                    ? corridor.walls[0].mesh.geometry.parameters.width ||
                    this.corridorWidth
                    : this.corridorWidth) * scale;
            const lengthZ =
                (corridor.walls && corridor.walls[0]
                    ? corridor.walls[0].mesh.geometry.parameters.depth ||
                    this.corridorWidth
                    : this.corridorWidth) * scale;
            ctx.fillRect(
                midX - lengthX / 2,
                midZ - lengthZ / 2,
                lengthX,
                lengthZ,
            );
        });

        ctx.fillStyle = "#ff0";
        const playerX = this.physics.player.mesh.position.x * scale + offsetX;
        const playerZ = this.physics.player.mesh.position.z * scale + offsetY;
        ctx.beginPath();
        ctx.arc(playerX, playerZ, 3, 0, 2 * Math.PI);
        ctx.fill();
    }

    intersectsAny(newRoom) {
        for (const room of this.rooms) {
            if (room === newRoom) continue;
            if (this.intersects(newRoom, room)) return true;
        }
        return false;
    }

    intersects(room1, room2) {
        const buffer = 0.5;
        const r1 = {
            left: room1.x - room1.width / 2 - buffer,
            right: room1.x + room1.width / 2 + buffer,
            top: room1.z - room1.depth / 2 - buffer,
            bottom: room1.z + room1.depth / 2 + buffer,
        };
        const r2 = {
            left: room2.x - room2.width / 2 - buffer,
            right: room2.x + room2.width / 2 + buffer,
            top: room2.z - room2.depth / 2 - buffer,
            bottom: room2.z + room2.depth / 2 + buffer,
        };
        return !(
            r1.right < r2.left ||
            r1.left > r2.right ||
            r1.bottom < r2.top ||
            r1.top > r2.bottom
        );
    }

    updateRoomVisibility(playerPosition) {
        this.rooms.forEach((room) => {
            const inRoom =
                Math.abs(playerPosition.x - room.x) < room.width / 2 &&
                Math.abs(playerPosition.z - room.z) < room.depth / 2;
            const nearRoom = this.rooms.some(
                (otherRoom) =>
                    otherRoom !== room &&
                    Math.abs(playerPosition.x - otherRoom.x) <
                    otherRoom.width / 2 + this.corridorWidth &&
                    Math.abs(playerPosition.z - otherRoom.z) <
                    otherRoom.depth / 2 + this.corridorWidth,
            );

            room.walls.forEach((wall) => {
                wall.mesh.visible =
                    inRoom ||
                    nearRoom ||
                    this.isNearCorridor(playerPosition, room);
            });
            room.floor.visible =
                inRoom || nearRoom || this.isNearCorridor(playerPosition, room);
            room.ceiling.visible =
                !inRoom &&
                (nearRoom ||
                    this.isNearCorridor(playerPosition, room) ||
                    this.isAdjacentRoom(playerPosition, room));
            if (inRoom && !room.visited) {
                this.renderer.setRoomLighting(room);
                room.visited = true;
            }
        });

        this.corridors.forEach((corridor) => {
            const inCorridor = this.isInCorridor(playerPosition, corridor);
            if (corridor.walls) {
                corridor.walls.forEach((wall) => {
                    wall.mesh.visible =
                        inCorridor || this.isNearRoom(playerPosition, corridor);
                });
            }
            corridor.floor.visible =
                inCorridor || this.isNearRoom(playerPosition, corridor);
            corridor.ceiling.visible =
                !inCorridor && this.isNearRoom(playerPosition, corridor);
        });
    }

    isInCorridor(playerPosition, corridor) {
        const midX =
            corridor.walls && corridor.walls[0]
                ? corridor.walls[0].mesh.position.x
                : corridor.floor.position.x;
        const midZ =
            corridor.walls && corridor.walls[0]
                ? corridor.walls[0].mesh.position.z
                : corridor.floor.position.z;
        const lengthX =
            corridor.walls && corridor.walls[0]
                ? corridor.walls[0].mesh.geometry.parameters.width ||
                this.corridorWidth
                : this.corridorWidth;
        const lengthZ =
            corridor.walls && corridor.walls[0]
                ? corridor.walls[0].mesh.geometry.parameters.depth ||
                this.corridorWidth
                : this.corridorWidth;
        return (
            Math.abs(playerPosition.x - midX) < lengthX / 2 + 1 &&
            Math.abs(playerPosition.z - midZ) < lengthZ / 2 + 1
        );
    }

    isNearCorridor(playerPosition, room) {
        return this.corridors.some((corridor) => {
            const midX =
                corridor.walls && corridor.walls[0]
                    ? corridor.walls[0].mesh.position.x
                    : corridor.floor.position.x;
            const midZ =
                corridor.walls && corridor.walls[0]
                    ? corridor.walls[0].mesh.position.z
                    : corridor.floor.position.z;
            return (
                Math.abs(playerPosition.x - midX) <
                room.width / 2 + this.corridorWidth &&
                Math.abs(playerPosition.z - midZ) <
                room.depth / 2 + this.corridorWidth
            );
        });
    }

    isNearRoom(playerPosition, corridor) {
        const midX =
            corridor.walls && corridor.walls[0]
                ? corridor.walls[0].mesh.position.x
                : corridor.floor.position.x;
        const midZ =
            corridor.walls && corridor.walls[0]
                ? corridor.walls[0].mesh.position.z
                : corridor.floor.position.z;
        return this.rooms.some((room) => {
            return (
                Math.abs(playerPosition.x - midX) <
                room.width / 2 + this.corridorWidth &&
                Math.abs(playerPosition.z - midZ) <
                room.depth / 2 + this.corridorWidth
            );
        });
    }

    isAdjacentRoom(playerPosition, room) {
        return this.rooms.some((otherRoom) => {
            if (otherRoom === room) return false;
            const dist = Math.sqrt(
                (room.x - otherRoom.x) ** 2 + (room.z - otherRoom.z) ** 2,
            );
            return (
                dist <
                (room.width + otherRoom.width) / 2 + this.corridorWidth &&
                Math.abs(playerPosition.x - otherRoom.x) <
                otherRoom.width / 2 &&
                Math.abs(playerPosition.z - otherRoom.z) < otherRoom.depth / 2
            );
        });
    }

    update() {
        this.updateRoomVisibility(this.physics.player.mesh.position);
        this.updateMinimap();
    }
}

export { GameScene };
