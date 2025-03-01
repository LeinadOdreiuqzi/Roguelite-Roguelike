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
        this.init();
    }

    init() {
        this.generateDungeon();
        this.placePlayer();
        this.setupMinimap();
    }

    generateDungeon() {
        const bspTree = this.generateBSPTree(this.mapWidth, this.mapHeight);
        this.rooms = [];
        this.generateRoomsFromBSP(bspTree);
        this.trimOverlappingRooms();
        this.connectRoomsWithKruskal();
        this.ensureDoorConnection();
        this.rooms.forEach(room => this.addRoomToScene(room));
        this.corridors.forEach(corridor => this.addCorridorToScene(corridor));
        this.removeWallExcess(); // Eliminar excesos de paredes después de generar todo
        console.log("Habitaciones generadas:", this.rooms.length, this.rooms.map(r => r.type));
    }

    generateBSPTree(width, height) {
        const root = { x: -width / 2, y: -height / 2, width, height };
        const nodes = [root];
        let splits = 0;
        const maxSplits = this.roomCount;

        while (splits < maxSplits) {
            const nodeIndex = Math.floor(Math.random() * nodes.length);
            const node = nodes[nodeIndex];
            if (node.width < this.minRoomSize * 2 && node.height < this.minRoomSize * 2) continue;

            const splitHorizontally = Math.random() > 0.5;
            if (splitHorizontally && node.height > this.minRoomSize * 2) {
                const splitY = node.y + this.minRoomSize + Math.random() * (node.height - 2 * this.minRoomSize);
                const topNode = { x: node.x, y: node.y, width: node.width, height: splitY - node.y };
                const bottomNode = { x: node.x, y: splitY, width: node.width, height: node.height - (splitY - node.y) };
                nodes.splice(nodeIndex, 1, topNode, bottomNode);
                splits++;
            } else if (node.width > this.minRoomSize * 2) {
                const splitX = node.x + this.minRoomSize + Math.random() * (node.width - 2 * this.minRoomSize);
                const leftNode = { x: node.x, y: node.y, width: splitX - node.x, height: node.height };
                const rightNode = { x: splitX, y: node.y, width: node.width - (splitX - node.x), height: node.height };
                nodes.splice(nodeIndex, 1, leftNode, rightNode);
                splits++;
            }
        }

        return nodes;
    }

    generateRoomsFromBSP(nodes) {
        let bossAssigned = false;
        nodes.forEach((node, index) => {
            const width = Math.min(this.maxRoomSize, Math.max(this.minRoomSize, node.width - 4));
            const height = Math.min(this.maxRoomSize, Math.max(this.minRoomSize, node.height - 4));
            const x = node.x + (node.width - width) / 2;
            const z = node.y + (node.height - height) / 2;
            const type = index === 0 ? 'start' : (index === nodes.length - 1 && !bossAssigned) ? 'boss' : (Math.random() < 0.15 ? 'secret' : 'normal');
            if (type === 'boss') bossAssigned = true;

            let intersectsCorridor = false;
            const newRoom = { x, z, width, depth: height };
            for (const corridor of this.corridors) {
                if (this.intersectsCorridor(newRoom, corridor)) {
                    intersectsCorridor = true;
                    break;
                }
            }

            if (!intersectsCorridor) {
                const room = this.createRoom(type, width, height, x, z);
                this.rooms.push(room);
            }
        });
    }

    intersectsCorridor(room, corridor) {
        const midX = corridor.walls && corridor.walls[0] ? corridor.walls[0].mesh.position.x : corridor.floor.position.x;
        const midZ = corridor.walls && corridor.walls[0] ? corridor.walls[0].mesh.position.z : corridor.floor.position.z;
        const lengthX = corridor.walls && corridor.walls[0] ? (corridor.walls[0].mesh.geometry.parameters.width || this.corridorWidth) : this.corridorWidth;
        const lengthZ = corridor.walls && corridor.walls[0] ? (corridor.walls[0].mesh.geometry.parameters.depth || this.corridorWidth) : this.corridorWidth;

        const r1 = {
            left: room.x - room.width / 2,
            right: room.x + room.width / 2,
            top: room.z - room.depth / 2,
            bottom: room.z + room.depth / 2
        };
        const r2 = {
            left: midX - lengthX / 2,
            right: midX + lengthX / 2,
            top: midZ - lengthZ / 2,
            bottom: midZ + lengthZ / 2
        };

        return !(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom);
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

                    roomA.walls.forEach(wall => {
                        if (wall.direction === 'north') wall.mesh.position.z = -roomA.depth / 2;
                        if (wall.direction === 'south') wall.mesh.position.z = roomA.depth / 2;
                        if (wall.direction === 'east') wall.mesh.position.x = roomA.width / 2;
                        if (wall.direction === 'west') wall.mesh.position.x = -roomA.width / 2;
                        wall.mesh.geometry = new THREE.PlaneGeometry(
                            wall.direction === 'north' || wall.direction === 'south' ? roomA.width : roomA.depth,
                            5
                        );
                    });
                    roomA.floor.geometry = new THREE.PlaneGeometry(roomA.width, roomA.depth);
                    roomA.ceiling.geometry = new THREE.PlaneGeometry(roomA.width, roomA.depth);

                    roomB.walls.forEach(wall => {
                        if (wall.direction === 'north') wall.mesh.position.z = -roomB.depth / 2;
                        if (wall.direction === 'south') wall.mesh.position.z = roomB.depth / 2;
                        if (wall.direction === 'east') wall.mesh.position.x = roomB.width / 2;
                        if (wall.direction === 'west') wall.mesh.position.x = -roomB.width / 2;
                        wall.mesh.geometry = new THREE.PlaneGeometry(
                            wall.direction === 'north' || wall.direction === 'south' ? roomB.width : roomB.depth,
                            5
                        );
                    });
                    roomB.floor.geometry = new THREE.PlaneGeometry(roomB.width, roomB.depth);
                    roomB.ceiling.geometry = new THREE.PlaneGeometry(roomB.width, roomB.depth);
                }
            }
        }
    }

    createRoom(type, width, depth, x, z) {
        const height = 5;
        const doors = [];
        const color = type === 'boss' ? 0x880000 : type === 'shop' ? 0x008800 : type === 'secret' ? 0x444444 : 0x555555;

        const wallMaterial = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
        const walls = {
            north: new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMaterial),
            south: new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMaterial),
            east: new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wallMaterial),
            west: new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wallMaterial)
        };
        walls.north.rotation.y = Math.PI;
        walls.north.position.z = -depth / 2;
        walls.south.position.z = depth / 2;
        walls.east.rotation.y = Math.PI / 2;
        walls.east.position.x = width / 2;
        walls.west.rotation.y = -Math.PI / 2;
        walls.west.position.x = -width / 2;

        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(width, depth),
            new THREE.MeshBasicMaterial({ color: 0x333333 })
        );
        floor.rotation.x = -Math.PI / 2;

        const ceiling = new THREE.Mesh(
            new THREE.PlaneGeometry(width, depth),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 })
        );
        ceiling.rotation.x = Math.PI / 2;

        return { walls: Object.entries(walls).map(([direction, mesh]) => ({ mesh, direction })), floor, ceiling, x, z, width, depth, height, type, doors, visited: false };
    }

    addRoomToScene(room) {
        room.walls.forEach(wall => {
            wall.mesh.position.x += room.x;
            wall.mesh.position.z += room.z;
            wall.mesh.position.y = room.height / 2;
            this.renderer.addToScene(wall.mesh);
        });
        room.floor.position.set(room.x, 0, room.z);
        room.ceiling.position.set(room.x, room.height, room.z);
        this.renderer.addToScene(room.floor);
        this.renderer.addToScene(room.ceiling);
    }

    addCorridorToScene(corridor) {
        if (corridor.walls) {
            corridor.walls.forEach(wall => {
                this.renderer.addToScene(wall.mesh);
            });
        }
        this.renderer.addToScene(corridor.floor);
        this.renderer.addToScene(corridor.ceiling);
    }

    getOppositeDirection(direction) {
        switch (direction) {
            case 'north': return 'south';
            case 'south': return 'north';
            case 'east': return 'west';
            case 'west': return 'east';
            default: return direction;
        }
    }

    openDoor(room, direction, doorWidth, corridorPos = null) {
        if (!room || !room.walls) {
            console.error("Error: Room o room.walls es undefined en openDoor", room);
            return;
        }
        const wallToOpen = room.walls.find(wall => wall.direction === direction);
        if (!wallToOpen) {
            console.warn(`No se encontró pared en dirección ${direction} para la habitación`, room);
            return;
        }

        const wallWidth = wallToOpen.mesh.geometry.parameters.width;
        const wallHeight = wallToOpen.mesh.geometry.parameters.height;

        const leftWall = new THREE.Mesh(
            new THREE.PlaneGeometry((wallWidth - doorWidth) / 2, wallHeight),
            wallToOpen.mesh.material
        );
        const rightWall = new THREE.Mesh(
            new THREE.PlaneGeometry((wallWidth - doorWidth) / 2, wallHeight),
            wallToOpen.mesh.material
        );

        leftWall.rotation.y = wallToOpen.mesh.rotation.y;
        rightWall.rotation.y = wallToOpen.mesh.rotation.y;
        leftWall.position.copy(wallToOpen.mesh.position);
        rightWall.position.copy(wallToOpen.mesh.position);

        let doorOffset = 0;
        if (corridorPos) {
            doorOffset = direction === 'north' || direction === 'south'
                ? corridorPos.x - room.x
                : corridorPos.z - room.z;
            doorOffset = Math.max(Math.min(doorOffset, wallWidth / 2 - doorWidth / 2), -wallWidth / 2 + doorWidth / 2);
        }

        if (direction === 'north' || direction === 'south') {
            leftWall.position.x = wallToOpen.mesh.position.x - doorWidth / 2 - (wallWidth - doorWidth) / 4 + doorOffset;
            rightWall.position.x = wallToOpen.mesh.position.x + doorWidth / 2 + (wallWidth - doorWidth) / 4 + doorOffset;
        } else {
            leftWall.position.z = wallToOpen.mesh.position.z - doorWidth / 2 - (wallWidth - doorWidth) / 4 + doorOffset;
            rightWall.position.z = wallToOpen.mesh.position.z + doorWidth / 2 + (wallWidth - doorWidth) / 4 + doorOffset;
        }

        this.renderer.removeFromScene(wallToOpen.mesh);
        room.walls = room.walls.filter(wall => wall.direction !== direction);
        room.walls.push({ mesh: leftWall, direction: `${direction}_left` });
        room.walls.push({ mesh: rightWall, direction: `${direction}_right` });
        this.renderer.addToScene(leftWall);
        this.renderer.addToScene(rightWall);
    }

    getClosestDirection(roomA, roomB) {
        const dx = roomB.x - roomA.x;
        const dz = roomB.z - roomA.z;
        if (Math.abs(dx) > Math.abs(dz)) {
            return dx > 0 ? 'east' : 'west';
        } else {
            return dz > 0 ? 'south' : 'north';
        }
    }

    connectWithDoor(roomA, roomB, doorDirection) {
        const doorWidth = this.corridorWidth * 0.8;
        let doorPosA = { x: roomA.x, z: roomA.z };
        let doorPosB = { x: roomB.x, z: roomB.z };
    
        // Calcular posición común para alinear las puertas
        if (doorDirection === 'north') {
            doorPosA.z = roomA.z - roomA.depth / 2;
            doorPosB.z = roomB.z + roomB.depth / 2;
            doorPosA.x = doorPosB.x = (doorPosA.x + doorPosB.x) / 2; // Alinear en el eje X
        } else if (doorDirection === 'south') {
            doorPosA.z = roomA.z + roomA.depth / 2;
            doorPosB.z = roomB.z - roomB.depth / 2;
            doorPosA.x = doorPosB.x = (doorPosA.x + doorPosB.x) / 2; // Alinear en el eje X
        } else if (doorDirection === 'east') {
            doorPosA.x = roomA.x + roomA.width / 2;
            doorPosB.x = roomB.x - roomB.width / 2;
            doorPosA.z = doorPosB.z = (doorPosA.z + doorPosB.z) / 2; // Alinear en el eje Z
        } else if (doorDirection === 'west') {
            doorPosA.x = roomA.x - roomA.width / 2;
            doorPosB.x = roomB.x + roomB.width / 2;
            doorPosA.z = doorPosB.z = (doorPosA.z + doorPosB.z) / 2; // Alinear en el eje Z
        }
    
        this.openDoor(roomA, doorDirection, doorWidth, doorPosA);
        this.openDoor(roomB, this.getOppositeDirection(doorDirection), doorWidth, doorPosB);
        roomA.doors.push(doorDirection);
        roomB.doors.push(this.getOppositeDirection(doorDirection));
    
        this.doorPositions.add(`${doorPosA.x},${doorPosA.z}`);
        this.doorPositions.add(`${doorPosB.x},${doorPosB.z}`);
    }

    createCorridorSegment(startX, startZ, endX, endZ, orientation, corridorMaterial, height) {
        let segment;
        if (orientation === 'vertical') {
            const length = Math.abs(endZ - startZ);
            segment = {
                walls: [
                    { mesh: new THREE.Mesh(new THREE.PlaneGeometry(this.corridorWidth, height), corridorMaterial), direction: 'east' },
                    { mesh: new THREE.Mesh(new THREE.PlaneGeometry(this.corridorWidth, height), corridorMaterial), direction: 'west' }
                ],
                floor: new THREE.Mesh(new THREE.PlaneGeometry(this.corridorWidth, length), new THREE.MeshBasicMaterial({ color: 0x333333 })),
                ceiling: new THREE.Mesh(new THREE.PlaneGeometry(this.corridorWidth, length), new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0 }))
            };
            segment.walls[0].mesh.rotation.y = Math.PI / 2;
            segment.walls[0].mesh.position.x = startX + this.corridorWidth / 2;
            segment.walls[1].mesh.rotation.y = -Math.PI / 2;
            segment.walls[1].mesh.position.x = startX - this.corridorWidth / 2;
            segment.floor.rotation.x = -Math.PI / 2;
            segment.ceiling.rotation.x = Math.PI / 2;
    
            const midZ = startZ + (endZ - startZ) / 2;
            segment.walls.forEach(wall => {
                wall.mesh.position.z = midZ;
                wall.mesh.position.y = height / 2;
            });
            segment.floor.position.set(startX, 0, midZ);
            segment.ceiling.position.set(startX, height, midZ);
            
            // Ajustar longitud de paredes para evitar excesos
            this.adjustWallLength(segment, startX, startZ, endX, endZ, 'vertical');
        } else {
            const length = Math.abs(endX - startX);
            segment = {
                walls: [
                    { mesh: new THREE.Mesh(new THREE.PlaneGeometry(length, height), corridorMaterial), direction: 'north' },
                    { mesh: new THREE.Mesh(new THREE.PlaneGeometry(length, height), corridorMaterial), direction: 'south' }
                ],
                floor: new THREE.Mesh(new THREE.PlaneGeometry(length, this.corridorWidth), new THREE.MeshBasicMaterial({ color: 0x333333 })),
                ceiling: new THREE.Mesh(new THREE.PlaneGeometry(length, this.corridorWidth), new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0 }))
            };
            segment.walls[0].mesh.rotation.y = Math.PI;
            segment.walls[0].mesh.position.z = startZ - this.corridorWidth / 2;
            segment.walls[1].mesh.position.z = startZ + this.corridorWidth / 2;
            segment.floor.rotation.x = -Math.PI / 2;
            segment.ceiling.rotation.x = Math.PI / 2;
    
            const midX = startX + (endX - startX) / 2;
            segment.walls.forEach(wall => {
                wall.mesh.position.x = midX;
                wall.mesh.position.y = height / 2;
            });
            segment.floor.position.set(midX, 0, startZ);
            segment.ceiling.position.set(midX, height, startZ);
            
            // Ajustar longitud de paredes para evitar excesos
            this.adjustWallLength(segment, startX, startZ, endX, endZ, 'horizontal');
        }
        return segment;
    }
    adjustWallLength(segment, startX, startZ, endX, endZ, orientation) {
        const height = 5;
        segment.walls.forEach(wall => {
            const wallBox = new THREE.Box3().setFromObject(wall.mesh);
            
            // Verificar intersecciones con habitaciones
            this.rooms.forEach(room => {
                const roomBox = new THREE.Box3().setFromCenterAndSize(
                    new THREE.Vector3(room.x, height / 2, room.z),
                    new THREE.Vector3(room.width, height, room.depth)
                );
                if (wallBox.intersectsBox(roomBox)) {
                    const overlap = this.calculateOverlap(wallBox, roomBox, wall.direction);
                    if (overlap) {
                        const newLength = orientation === 'vertical' ? this.corridorWidth : Math.abs(endX - startX) - overlap.amount;
                        if (newLength > 0) {
                            wall.mesh.geometry = new THREE.PlaneGeometry(newLength, height);
                            if (orientation === 'horizontal') {
                                wall.mesh.position.x = startX + (endX - startX) / 2;
                            }
                        } else {
                            this.renderer.removeFromScene(wall.mesh);
                            segment.walls = segment.walls.filter(w => w !== wall);
                        }
                    }
                }
            });
    
            // Verificar intersecciones con otros pasillos
            this.corridors.forEach(otherCorridor => {
                if (otherCorridor === segment) return;
                const corridorBox = new THREE.Box3().setFromCenterAndSize(
                    new THREE.Vector3(otherCorridor.floor.position.x, height / 2, otherCorridor.floor.position.z),
                    new THREE.Vector3(otherCorridor.floor.geometry.parameters.width, height, otherCorridor.floor.geometry.parameters.depth)
                );
                if (wallBox.intersectsBox(corridorBox)) {
                    const overlap = this.calculateOverlap(wallBox, corridorBox, wall.direction);
                    if (overlap) {
                        const newLength = orientation === 'vertical' ? this.corridorWidth : Math.abs(endX - startX) - overlap.amount;
                        if (newLength > 0) {
                            wall.mesh.geometry = new THREE.PlaneGeometry(newLength, height);
                            if (orientation === 'horizontal') {
                                wall.mesh.position.x = startX + (endX - startX) / 2;
                            }
                        } else {
                            this.renderer.removeFromScene(wall.mesh);
                            segment.walls = segment.walls.filter(w => w !== wall);
                        }
                    }
                }
            });
        });
    }
    createCorridor(roomA, roomB, doorDirection) {
        const startX = roomA.x;
        const startZ = roomA.z;
        const endX = roomB.x;
        const endZ = roomB.z;
        const height = 5;
        const corridorMaterial = new THREE.MeshBasicMaterial({ color: 0x777777, side: THREE.DoubleSide });
        const doorWidth = this.corridorWidth * 0.8;

        let startPosX = startX, startPosZ = startZ, endPosX = endX, endPosZ = endZ;
        let doorPosXStart = startX, doorPosZStart = startZ, doorPosXEnd = endX, doorPosZEnd = endZ;

        if (doorDirection === 'north') {
            startPosZ = startZ - roomA.depth / 2;
            endPosZ = endZ + roomB.depth / 2;
            doorPosZStart = startPosZ;
            doorPosZEnd = endPosZ;
        } else if (doorDirection === 'south') {
            startPosZ = startZ + roomA.depth / 2;
            endPosZ = endZ - roomB.depth / 2;
            doorPosZStart = startPosZ;
            doorPosZEnd = endPosZ;
        } else if (doorDirection === 'east') {
            startPosX = startX + roomA.width / 2;
            endPosX = endX - roomB.width / 2;
            doorPosXStart = startPosX;
            doorPosXEnd = endPosX;
        } else if (doorDirection === 'west') {
            startPosX = startX - roomA.width / 2;
            endPosX = endX + roomB.width / 2;
            doorPosXStart = startPosX;
            doorPosXEnd = endPosX;
        }

        const segments = [];
        const testAndAddSegment = (segment) => {
            let intersectsRoom = false;
            for (const room of this.rooms) {
                if (room === roomA || room === roomB) continue;
                if (this.intersectsCorridor(room, segment)) {
                    intersectsRoom = true;
                    break;
                }
            }
            if (!intersectsRoom) {
                segment.walls.forEach(wall => {
                    const wallBox = new THREE.Box3().setFromObject(wall.mesh);
                    for (const room of this.rooms) {
                        if (room === roomA || room === roomB) continue;
                        const roomBox = new THREE.Box3().setFromCenterAndSize(
                            new THREE.Vector3(room.x, height / 2, room.z),
                            new THREE.Vector3(room.width, height, room.depth)
                        );
                        if (wallBox.intersectsBox(roomBox)) {
                            intersectsRoom = true;
                            break;
                        }
                    }
                });
            }
            if (!intersectsRoom) segments.push(segment);
            return !intersectsRoom;
        };

        const checkNearbyRoomsAndCorridors = (segment) => {
            const midX = segment.floor.position.x;
            const midZ = segment.floor.position.z;
            const lengthX = segment.floor.geometry.parameters.width;
            const lengthZ = segment.floor.geometry.parameters.depth;
            const corridorBox = new THREE.Box3().setFromCenterAndSize(
                new THREE.Vector3(midX, height / 2, midZ),
                new THREE.Vector3(lengthX + this.corridorWidth, height, lengthZ + this.corridorWidth)
            );

            // Conexión con habitaciones cercanas
            this.rooms.forEach(room => {
                if (room === roomA || room === roomB) return;
                const roomBox = new THREE.Box3().setFromCenterAndSize(
                    new THREE.Vector3(room.x, height / 2, room.z),
                    new THREE.Vector3(room.width, height, room.depth)
                );
                if (corridorBox.intersectsBox(roomBox)) {
                    const dist = Math.sqrt((midX - room.x) ** 2 + (midZ - room.z) ** 2);
                    const directionToRoom = this.getClosestDirection({ x: midX, z: midZ }, room);
                    if (!room.doors.includes(directionToRoom) && !this.doorPositions.has(`${midX},${midZ}`)) {
                        if (dist < this.corridorWidth * 2) {
                            const corridorPos = { x: midX, z: midZ };
                            this.openDoor(room, directionToRoom, doorWidth, corridorPos);
                            room.doors.push(directionToRoom);
                            this.doorPositions.add(`${midX},${midZ}`);
                        } else if (dist < this.maxRoomSize) {
                            const tempRoom = this.createRoom('normal', this.corridorWidth, this.corridorWidth, midX, midZ);
                            this.rooms.push(tempRoom);
                            this.addRoomToScene(tempRoom);
                            this.createCorridor(tempRoom, room, directionToRoom);
                        }
                    }
                }
            });

            // Conexión con otros pasillos
            this.corridors.forEach(otherCorridor => {
                if (otherCorridor === segment) return;
                const otherBox = new THREE.Box3().setFromCenterAndSize(
                    new THREE.Vector3(otherCorridor.floor.position.x, height / 2, otherCorridor.floor.position.z),
                    new THREE.Vector3(otherCorridor.floor.geometry.parameters.width, height, otherCorridor.floor.geometry.parameters.depth)
                );
                if (corridorBox.intersectsBox(otherBox)) {
                    const directionToCorridor = this.getClosestDirection({ x: midX, z: midZ }, { x: otherCorridor.floor.position.x, z: otherCorridor.floor.position.z });
                    if (!this.doorPositions.has(`${midX},${midZ}`)) {
                        segment.walls.forEach(wall => {
                            if (wall.direction === directionToCorridor) {
                                this.openDoor({ walls: segment.walls, x: midX, z: midZ, doors: [] }, directionToCorridor, doorWidth, { x: otherCorridor.floor.position.x, z: otherCorridor.floor.position.z });
                            }
                        });
                        this.doorPositions.add(`${midX},${midZ}`);
                    }
                }
            });
        };

        if (doorDirection === 'north' || doorDirection === 'south') {
            const length = Math.abs(endPosZ - startPosZ);
            if (Math.abs(startX - endX) > this.corridorWidth) {
                const midX = startX + (endX - startX) / 2;
                const segment1 = this.createCorridorSegment(startX, startPosZ, startX, startPosZ + length / 2, 'vertical', corridorMaterial, height);
                const segment2 = this.createCorridorSegment(startX, startPosZ + length / 2, endX, startPosZ + length / 2, 'horizontal', corridorMaterial, height);
                const segment3 = this.createCorridorSegment(endX, startPosZ + length / 2, endX, endPosZ, 'vertical', corridorMaterial, height);
                if (testAndAddSegment(segment1) && testAndAddSegment(segment2) && testAndAddSegment(segment3)) {
                    segments.push(segment1, segment2, segment3);
                    checkNearbyRoomsAndCorridors(segment1);
                    checkNearbyRoomsAndCorridors(segment2);
                    checkNearbyRoomsAndCorridors(segment3);
                }
            } else {
                const segment = this.createCorridorSegment(startX, startPosZ, startX, endPosZ, 'vertical', corridorMaterial, height);
                if (testAndAddSegment(segment)) {
                    segments.push(segment);
                    checkNearbyRoomsAndCorridors(segment);
                }
            }
        } else {
            const length = Math.abs(endPosX - startPosX);
            if (Math.abs(startZ - endZ) > this.corridorWidth) {
                const midZ = startZ + (endZ - startZ) / 2;
                const segment1 = this.createCorridorSegment(startPosX, startZ, startPosX + length / 2, startZ, 'horizontal', corridorMaterial, height);
                const segment2 = this.createCorridorSegment(startPosX + length / 2, startZ, startPosX + length / 2, endZ, 'vertical', corridorMaterial, height);
                const segment3 = this.createCorridorSegment(startPosX + length / 2, endZ, endPosX, endZ, 'horizontal', corridorMaterial, height);
                if (testAndAddSegment(segment1) && testAndAddSegment(segment2) && testAndAddSegment(segment3)) {
                    segments.push(segment1, segment2, segment3);
                    checkNearbyRoomsAndCorridors(segment1);
                    checkNearbyRoomsAndCorridors(segment2);
                    checkNearbyRoomsAndCorridors(segment3);
                }
            } else {
                const segment = this.createCorridorSegment(startPosX, startZ, endPosX, startZ, 'horizontal', corridorMaterial, height);
                if (testAndAddSegment(segment)) {
                    segments.push(segment);
                    checkNearbyRoomsAndCorridors(segment);
                }
            }
        }

        if (segments.length > 0) {
            segments.forEach(segment => this.corridors.push(segment));
            const corridorStartPos = { x: segments[0].floor.position.x, z: segments[0].floor.position.z };
            const corridorEndPos = { x: segments[segments.length - 1].floor.position.x, z: segments[segments.length - 1].floor.position.z };
            this.openDoor(roomA, doorDirection, doorWidth, corridorStartPos);
            this.openDoor(roomB, this.getOppositeDirection(doorDirection), doorWidth, corridorEndPos);
            roomA.doors.push(doorDirection);
            roomB.doors.push(this.getOppositeDirection(doorDirection));
            this.doorPositions.add(`${doorPosXStart},${doorPosZStart}`);
            this.doorPositions.add(`${doorPosXEnd},${doorPosZEnd}`);
        }
    }

    removeWallExcess() {
        const height = 5;
    
        // Verificar paredes de pasillos contra habitaciones y otros pasillos
        this.corridors.forEach(corridor => {
            const corridorBox = new THREE.Box3().setFromCenterAndSize(
                new THREE.Vector3(corridor.floor.position.x, height / 2, corridor.floor.position.z),
                new THREE.Vector3(corridor.floor.geometry.parameters.width, height, corridor.floor.geometry.parameters.depth)
            );
    
            // Verificar paredes de habitaciones dentro del pasillo
            this.rooms.forEach(room => {
                room.walls.forEach(wall => {
                    const wallBox = new THREE.Box3().setFromObject(wall.mesh);
                    if (corridorBox.containsBox(wallBox)) {
                        this.renderer.removeFromScene(wall.mesh);
                        room.walls = room.walls.filter(w => w !== wall);
                    } else if (wallBox.intersectsBox(corridorBox)) {
                        const overlap = this.calculateOverlap(wallBox, corridorBox, wall.direction);
                        if (overlap) {
                            this.trimWall(wall, overlap, room);
                        }
                    }
                });
            });
    
            // Verificar paredes de otros pasillos dentro de este pasillo
            this.corridors.forEach(otherCorridor => {
                if (otherCorridor === corridor) return;
                otherCorridor.walls.forEach(otherWall => {
                    const otherWallBox = new THREE.Box3().setFromObject(otherWall.mesh);
                    if (corridorBox.containsBox(otherWallBox)) {
                        this.renderer.removeFromScene(otherWall.mesh);
                        otherCorridor.walls = otherCorridor.walls.filter(w => w !== otherWall);
                    } else if (otherWallBox.intersectsBox(corridorBox)) {
                        const overlap = this.calculateOverlap(otherWallBox, corridorBox, otherWall.direction);
                        if (overlap) {
                            this.trimWall(otherWall, overlap, null);
                        }
                    }
                });
            });
    
            // Verificar paredes de este pasillo contra habitaciones
            corridor.walls.forEach(wall => {
                const wallBox = new THREE.Box3().setFromObject(wall.mesh);
                this.rooms.forEach(room => {
                    const roomBox = new THREE.Box3().setFromCenterAndSize(
                        new THREE.Vector3(room.x, height / 2, room.z),
                        new THREE.Vector3(room.width, height, room.depth)
                    );
                    if (roomBox.containsBox(wallBox)) {
                        this.renderer.removeFromScene(wall.mesh);
                        corridor.walls = corridor.walls.filter(w => w !== wall);
                    } else if (wallBox.intersectsBox(roomBox)) {
                        const overlap = this.calculateOverlap(wallBox, roomBox, wall.direction);
                        if (overlap) {
                            this.trimWall(wall, overlap, null);
                        }
                    }
                });
            });
        });
    }

    calculateOverlap(wallBox, obstacleBox, direction) {
        const wallMin = wallBox.min;
        const wallMax = wallBox.max;
        const obsMin = obstacleBox.min;
        const obsMax = obstacleBox.max;

        if (direction === 'north' || direction === 'south') {
            const overlapX = Math.min(wallMax.x, obsMax.x) - Math.max(wallMin.x, obsMin.x);
            if (overlapX > 0 && wallMin.z < obsMax.z && wallMax.z > obsMin.z) {
                return { axis: 'x', amount: overlapX, min: Math.max(wallMin.x, obsMin.x), max: Math.min(wallMax.x, obsMax.x) };
            }
        } else {
            const overlapZ = Math.min(wallMax.z, obsMax.z) - Math.max(wallMin.z, obsMin.z);
            if (overlapZ > 0 && wallMin.x < obsMax.x && wallMax.x > obsMin.x) {
                return { axis: 'z', amount: overlapZ, min: Math.max(wallMin.z, obsMin.z), max: Math.min(wallMax.z, obsMax.z) };
            }
        }
        return null;
    }

    trimWall(wall, overlap, room) {
        const wallWidth = wall.mesh.geometry.parameters.width;
        const wallHeight = wall.mesh.geometry.parameters.height;
        const material = wall.mesh.material;

        if (overlap.amount >= wallWidth) {
            this.renderer.removeFromScene(wall.mesh);
            if (room) {
                room.walls = room.walls.filter(w => w !== wall);
            }
            return;
        }

        const leftWidth = overlap.min - wall.mesh.position[overlap.axis] + wallWidth / 2;
        const rightWidth = wallWidth / 2 - (overlap.max - wall.mesh.position[overlap.axis]);

        if (leftWidth > 0) {
            const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(leftWidth, wallHeight), material);
            leftWall.rotation.y = wall.mesh.rotation.y;
            leftWall.position.copy(wall.mesh.position);
            leftWall.position[overlap.axis] -= (wallWidth / 2 - leftWidth / 2);
            this.renderer.addToScene(leftWall);
            if (room) room.walls.push({ mesh: leftWall, direction: `${wall.direction}_left` });
        }

        if (rightWidth > 0) {
            const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(rightWidth, wallHeight), material);
            rightWall.rotation.y = wall.mesh.rotation.y;
            rightWall.position.copy(wall.mesh.position);
            rightWall.position[overlap.axis] += (wallWidth / 2 - rightWidth / 2);
            this.renderer.addToScene(rightWall);
            if (room) room.walls.push({ mesh: rightWall, direction: `${wall.direction}_right` });
        }

        this.renderer.removeFromScene(wall.mesh);
        if (room) {
            room.walls = room.walls.filter(w => w !== wall);
        }
    }

    connectRoomsWithKruskal() {
        const edges = [];
        for (let i = 0; i < this.rooms.length; i++) {
            for (let j = i + 1; j < this.rooms.length; j++) {
                const roomA = this.rooms[i];
                const roomB = this.rooms[j];
                const dist = Math.sqrt((roomA.x - roomB.x) ** 2 + (roomA.z - roomB.z) ** 2);
                const direction = this.getClosestDirection(roomA, roomB);
                const isAdjacent = Math.abs(roomA.x - roomB.x) < (roomA.width / 2 + roomB.width / 2 + this.corridorWidth / 2) &&
                                   Math.abs(roomA.z - roomB.z) < (roomA.depth / 2 + roomB.depth / 2 + this.corridorWidth / 2);
                edges.push({ from: roomA, to: roomB, distance: dist, direction, isAdjacent });
            }
        }
    
        edges.sort((a, b) => a.distance - b.distance);
        const connected = new Set([this.rooms[0]]);
        const unconnected = new Set(this.rooms.slice(1));
        const connections = new Map(); // Para rastrear conexiones ya existentes
    
        edges.forEach((edge) => {
            const key = `${Math.min(this.rooms.indexOf(edge.from), this.rooms.indexOf(edge.to))}-${Math.max(this.rooms.indexOf(edge.from), this.rooms.indexOf(edge.to))}`;
            if (connections.has(key)) return; // Evitar conexiones redundantes
    
            if (connected.has(edge.from) && !connected.has(edge.to)) {
                if (edge.isAdjacent) {
                    this.connectWithDoor(edge.from, edge.to, edge.direction);
                } else {
                    this.createCorridor(edge.from, edge.to, edge.direction);
                }
                connections.set(key, true);
                connected.add(edge.to);
                unconnected.delete(edge.to);
            } else if (connected.has(edge.to) && !connected.has(edge.from)) {
                if (edge.isAdjacent) {
                    this.connectWithDoor(edge.to, edge.from, this.getOppositeDirection(edge.direction));
                } else {
                    this.createCorridor(edge.to, edge.from, this.getOppositeDirection(edge.direction));
                }
                connections.set(key, true);
                connected.add(edge.from);
                unconnected.delete(edge.from);
            }
        });
    
        // Conectar habitaciones adyacentes directamente con puertas
        for (let i = 0; i < this.rooms.length; i++) {
            for (let j = i + 1; j < this.rooms.length; j++) {
                const roomA = this.rooms[i];
                const roomB = this.rooms[j];
                const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
                if (connections.has(key)) continue; // Evitar redundancia
    
                const distX = Math.abs(roomA.x - roomB.x);
                const distZ = Math.abs(roomA.z - roomB.z);
                if (distX < (roomA.width / 2 + roomB.width / 2 + this.corridorWidth / 2) &&
                    distZ < (roomA.depth / 2 + roomB.depth / 2 + this.corridorWidth / 2)) {
                    const direction = this.getClosestDirection(roomA, roomB);
                    if (!roomA.doors.includes(direction) && !roomB.doors.includes(this.getOppositeDirection(direction))) {
                        this.connectWithDoor(roomA, roomB, direction);
                        connections.set(key, true);
                    }
                }
            }
        }
    }

    ensureDoorConnection() {
        const minDoorDistance = this.corridorWidth;
        const unconnectedRooms = new Set(this.rooms);

        this.rooms.forEach(room => {
            if (room.doors.length > 0) unconnectedRooms.delete(room);

            room.doors.forEach((doorDirection) => {
                let doorPosX = room.x, doorPosZ = room.z;
                if (doorDirection === 'north') doorPosZ = room.z - room.depth / 2;
                else if (doorDirection === 'south') doorPosZ = room.z + room.depth / 2;
                else if (doorDirection === 'east') doorPosX = room.x + room.width / 2;
                else if (doorDirection === 'west') doorPosX = room.x - room.width / 2;

                let isConnected = this.doorPositions.has(`${doorPosX},${doorPosZ}`);
                if (isConnected) return;

                let closestRoom = null;
                let closestDist = Infinity;
                let bestDirection = doorDirection;

                for (const otherRoom of this.rooms) {
                    if (otherRoom === room) continue;
                    const dist = Math.sqrt((room.x - otherRoom.x) ** 2 + (room.z - otherRoom.z) ** 2);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestRoom = otherRoom;
                        bestDirection = this.getClosestDirection(room, otherRoom);
                    }
                }

                if (closestRoom) {
                    const newDoorPosX = doorPosX;
                    const newDoorPosZ = doorPosZ;
                    let tooClose = false;
                    for (const existingPos of this.doorPositions) {
                        const [existingX, existingZ] = existingPos.split(',').map(Number);
                        const dist = Math.sqrt((newDoorPosX - existingX) ** 2 + (newDoorPosZ - existingZ) ** 2);
                        if (dist < minDoorDistance) {
                            tooClose = true;
                            break;
                        }
                    }

                    if (!tooClose) {
                        this.createCorridor(room, closestRoom, bestDirection);
                        unconnectedRooms.delete(room);
                        unconnectedRooms.delete(closestRoom);
                    } else {
                        this.connectWithDoor(room, closestRoom, bestDirection);
                        unconnectedRooms.delete(room);
                        unconnectedRooms.delete(closestRoom);
                    }
                }
            });
        });

        unconnectedRooms.forEach(room => {
            const closestRoom = this.rooms
                .filter(r => r !== room && r.doors.length > 0)
                .reduce((closest, curr) => {
                    const dist = Math.sqrt((room.x - curr.x) ** 2 + (room.z - curr.z) ** 2);
                    return dist < Math.sqrt((room.x - closest.x) ** 2 + (room.z - closest.z) ** 2) ? curr : closest;
                }, this.rooms[0]);
            const direction = this.getClosestDirection(room, closestRoom);
            this.createCorridor(room, closestRoom, direction);
        });
    }

    placePlayer() {
        const startRoom = this.rooms[0];
        const safeX = startRoom.x + (Math.random() * (startRoom.width - 2) - (startRoom.width / 2 - 1));
        const safeZ = startRoom.z + (Math.random() * (startRoom.depth - 2) - (startRoom.depth / 2 - 1));
        this.physics.player.mesh.position.set(safeX, 0.5, safeZ);
        console.log("Jugador colocado en sala inicial:", safeX, safeZ);
    }

    setupMinimap() {
        this.minimapCanvas = document.createElement('canvas');
        this.minimapCanvas.id = 'minimap';
        this.minimapCanvas.width = 200;
        this.minimapCanvas.height = 200;
        this.minimapCanvas.style.position = 'absolute';
        this.minimapCanvas.style.top = '10px';
        this.minimapCanvas.style.right = '10px';
        this.minimapCanvas.style.border = '1px solid white';
        this.minimapCanvas.style.display = 'none';
        document.body.appendChild(this.minimapCanvas);

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Tab') {
                event.preventDefault();
                this.minimapVisible = !this.minimapVisible;
                this.updateMinimap();
            }
        });
    }

    updateMinimap() {
        if (!this.minimapCanvas) return;

        const ctx = this.minimapCanvas.getContext('2d');
        ctx.clearRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);

        if (!this.minimapVisible) {
            this.minimapCanvas.style.display = 'none';
            return;
        }

        this.minimapCanvas.style.display = 'block';
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);

        const scale = 5;
        const offsetX = this.minimapCanvas.width / 2;
        const offsetY = this.minimapCanvas.height / 2;

        this.rooms.forEach(room => {
            ctx.fillStyle = room.visited
                ? (room.type === 'start' ? '#00ff00' : room.type === 'boss' ? '#ff0000' : room.type === 'secret' ? '#444' : '#555')
                : '#333';
            const x = (room.x * scale) + offsetX - (room.width * scale) / 2;
            const y = (room.z * scale) + offsetY - (room.depth * scale) / 2;
            ctx.fillRect(x, y, room.width * scale, room.depth * scale);
        });

        this.corridors.forEach(corridor => {
            ctx.fillStyle = '#777';
            const midX = (corridor.walls && corridor.walls[0] ? corridor.walls[0].mesh.position.x : corridor.floor.position.x) * scale + offsetX;
            const midZ = (corridor.walls && corridor.walls[0] ? corridor.walls[0].mesh.position.z : corridor.floor.position.z) * scale + offsetY;
            const lengthX = (corridor.walls && corridor.walls[0] ? (corridor.walls[0].mesh.geometry.parameters.width || this.corridorWidth) : this.corridorWidth) * scale;
            const lengthZ = (corridor.walls && corridor.walls[0] ? (corridor.walls[0].mesh.geometry.parameters.depth || this.corridorWidth) : this.corridorWidth) * scale;
            ctx.fillRect(
                midX - lengthX / 2,
                midZ - lengthZ / 2,
                lengthX,
                lengthZ
            );
        });

        ctx.fillStyle = '#ff0';
        const playerX = (this.physics.player.mesh.position.x * scale) + offsetX;
        const playerZ = (this.physics.player.mesh.position.z * scale) + offsetY;
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
            bottom: room1.z + room1.depth / 2 + buffer
        };
        const r2 = {
            left: room2.x - room2.width / 2 - buffer,
            right: room2.x + room2.width / 2 + buffer,
            top: room2.z - room2.depth / 2 - buffer,
            bottom: room2.z + room2.depth / 2 + buffer
        };
        return !(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom);
    }

    updateRoomVisibility(playerPosition) {
        this.rooms.forEach(room => {
            const inRoom = Math.abs(playerPosition.x - room.x) < room.width / 2 &&
                           Math.abs(playerPosition.z - room.z) < room.depth / 2;
            const nearRoom = this.rooms.some(otherRoom =>
                otherRoom !== room &&
                Math.abs(playerPosition.x - otherRoom.x) < otherRoom.width / 2 + this.corridorWidth &&
                Math.abs(playerPosition.z - otherRoom.z) < otherRoom.depth / 2 + this.corridorWidth
            );

            room.walls.forEach(wall => {
                wall.mesh.visible = inRoom || nearRoom || this.isNearCorridor(playerPosition, room);
            });
            room.floor.visible = inRoom || nearRoom || this.isNearCorridor(playerPosition, room);
            room.ceiling.visible = !inRoom && (nearRoom || this.isNearCorridor(playerPosition, room) || this.isAdjacentRoom(playerPosition, room));
            if (inRoom && !room.visited) {
                this.renderer.setRoomLighting(room);
                room.visited = true;
            }
        });

        this.corridors.forEach(corridor => {
            const inCorridor = this.isInCorridor(playerPosition, corridor);
            if (corridor.walls) {
                corridor.walls.forEach(wall => {
                    wall.mesh.visible = inCorridor || this.isNearRoom(playerPosition, corridor);
                });
            }
            corridor.floor.visible = inCorridor || this.isNearRoom(playerPosition, corridor);
            corridor.ceiling.visible = !inCorridor && this.isNearRoom(playerPosition, corridor);
        });
    }

    isInCorridor(playerPosition, corridor) {
        const midX = corridor.walls && corridor.walls[0] ? corridor.walls[0].mesh.position.x : corridor.floor.position.x;
        const midZ = corridor.walls && corridor.walls[0] ? corridor.walls[0].mesh.position.z : corridor.floor.position.z;
        const lengthX = corridor.walls && corridor.walls[0] ? (corridor.walls[0].mesh.geometry.parameters.width || this.corridorWidth) : this.corridorWidth;
        const lengthZ = corridor.walls && corridor.walls[0] ? (corridor.walls[0].mesh.geometry.parameters.depth || this.corridorWidth) : this.corridorWidth;
        return Math.abs(playerPosition.x - midX) < lengthX / 2 + 1 &&
               Math.abs(playerPosition.z - midZ) < lengthZ / 2 + 1;
    }

    isNearCorridor(playerPosition, room) {
        return this.corridors.some(corridor => {
            const midX = corridor.walls && corridor.walls[0] ? corridor.walls[0].mesh.position.x : corridor.floor.position.x;
            const midZ = corridor.walls && corridor.walls[0] ? corridor.walls[0].mesh.position.z : corridor.floor.position.z;
            return Math.abs(playerPosition.x - midX) < room.width / 2 + this.corridorWidth &&
                   Math.abs(playerPosition.z - midZ) < room.depth / 2 + this.corridorWidth;
        });
    }

    isNearRoom(playerPosition, corridor) {
        const midX = corridor.walls && corridor.walls[0] ? corridor.walls[0].mesh.position.x : corridor.floor.position.x;
        const midZ = corridor.walls && corridor.walls[0] ? corridor.walls[0].mesh.position.z : corridor.floor.position.z;
        return this.rooms.some(room => {
            return Math.abs(playerPosition.x - midX) < room.width / 2 + this.corridorWidth &&
                   Math.abs(playerPosition.z - midZ) < room.depth / 2 + this.corridorWidth;
        });
    }

    isAdjacentRoom(playerPosition, room) {
        return this.rooms.some(otherRoom => {
            if (otherRoom === room) return false;
            const dist = Math.sqrt((room.x - otherRoom.x) ** 2 + (room.z - otherRoom.z) ** 2);
            return dist < (room.width + otherRoom.width) / 2 + this.corridorWidth &&
                   Math.abs(playerPosition.x - otherRoom.x) < otherRoom.width / 2 &&
                   Math.abs(playerPosition.z - otherRoom.z) < otherRoom.depth / 2;
        });
    }

    update() {
        this.updateRoomVisibility(this.physics.player.mesh.position);
        this.updateMinimap();
    }
}

export { GameScene };