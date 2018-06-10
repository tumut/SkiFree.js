(function () {
	const FPS = 60;
	const TICK_DURATION = 1 / FPS;
	const TAMX = 640;
	const TAMY = 480;

	const PIXELS_PER_METER = 15;

	const SKIER_LOCATION = { top: 100, left: TAMX / 2 };

	const CHUNK_SIZE = { width: (TAMX / 3.0) / PIXELS_PER_METER, height: (TAMY / 2.0) / PIXELS_PER_METER };
	const QUADRANTS_PER_CHUNK = { x: 1, y: 1 };
	const QUADRANT_SIZE = { width: CHUNK_SIZE.width / QUADRANTS_PER_CHUNK.x, height: CHUNK_SIZE.height / QUADRANTS_PER_CHUNK.y };

	const SKIER_INITIAL_POS = {
		x: CHUNK_SIZE.width / 2 - 20 / PIXELS_PER_METER,
		y: 0.2 * CHUNK_SIZE.height
	};

	const MIN_OBSTACLE_SPAWN_DISTANCE = Math.min(CHUNK_SIZE.height, CHUNK_SIZE.width) / 3;

	const LEFTMOST = 0;
	const MORE_LEFT = 1;
	const LEFT = 2;
	const FORWARD = 3;
	const RIGHT = 4;
	const MORE_RIGHT = 5;
	const RIGHTMOST = 6;

	const MIN_DIR = LEFTMOST;
	const MAX_DIR = RIGHTMOST;
	const INITIAL_DIR = RIGHTMOST;

	const SKIER_FALLING_CLASS = 'falling';
	const SKIER_DEAD_CLASS = 'ouch';

	const DIR_CLASSES = ['leftmost', 'more-left', 'left', 'forward', 'right', 'more-right', 'rightmost']
	const DIR_ANGLES = [ 180, 202, 227, 270, 313, 338, 360 ]; // In degrees

	const MAX_SPEED = 20 * TICK_DURATION; // In meters/tick
	const TURBO_MAX_SPEED = 40 * TICK_DURATION; // In meters/tick
	const ACCEL = 1 * TICK_DURATION; // In meters/tick², approximately
	const TURBO_ACCEL = 9 * TICK_DURATION;
	const ANGLE_ACCEL = 300 * TICK_DURATION;

	const INVALID_HITBOX = {
		top: -1000,
		left: -1000,
		width: 0,
		height: 0
	};

	const INITIAL_HEALTH = 3;
	const SKIER_HITBOX = {
		top: 17,
		left: 2,
		width: 13,
		height: 16
	};
	const INVINCIBILITY_DURATION = 1000; // In miliseconds
	const DOWN_DURATION = 1000; // In miliseconds

	// Between 0 (no bushes become flaming) and 1 (all bushes become flaming)
	const FLAMING_BUSH_PROB = 0.1;

	const MIN_DOG_SPAWN_Y_DISTANCE = TAMY * 2 / PIXELS_PER_METER;
	const DOG_SPEED = 10 * TICK_DURATION; // In meters/tick
	const DOG_SPAWN_INTERVAL = { min: FPS * 5, max: FPS * 20 }; // Spawn one dog every 5-20 seconds
	const DOG_HITBOX = {
		top: 0,
		left: 0,
		width: 22,
		height: 19
	};

	const YETI_SPAWN_MILESTONE = 3000; // In meters
	const YETI_SPEED = MAX_SPEED * 1.5;
	const YETI_DISTANCE = {
		x: [ (TAMX * 0.5) / PIXELS_PER_METER, (TAMX * -0.5) / PIXELS_PER_METER ],
		y: [ 0, (TAMY - SKIER_LOCATION.top) / PIXELS_PER_METER ]
	};
	const YETI_HITBOX = {
		top: 14,
		left: 10,
		width: 11,
		height: 25
	};

	function degToRadian(degrees) {
		return degrees * (Math.PI / 180);
	}

	function randomRange(low, high) {
		let range = high - low;
		let rand = Math.random() * range;
		rand += low;
		return rand;
	}

	function vecDistance(v1, v2) {
		let delta = {
			x: v2.x - v1.x,
			y: v2.y - v1.y
		};

		return Math.sqrt(Math.pow(delta.x, 2) + Math.pow(delta.y, 2));
	}

	function hitboxesIntersect(s, o) {
		let h1 = s.getHitbox();
		let h2 = o.getHitbox();

		function convert(h) {
			return {
				left: h.left,
				right: h.left + h.width,
				top: h.top,
				bottom: h.top + h.height
			};
		}

		let a = convert(h1);
		let b = convert(h2);

		if (a.bottom > b.bottom && !(o instanceof Mushroom) && !(o instanceof Yeti)) {
			// Impedir que o esquiador bata em objetos que já foram passados pra trás
			return false;
		}

		return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
	}

	var obstacleData = [
		{
			className: 'tall-tree',
			construct: undefined,
			distributionInterval: { min: 4, max: 7 },
			intervalToSpawn: undefined,
			hitbox: { top: 43, left: 5, width: 27, height: 21 }
		},
		{
			className: 'rock',
			construct: undefined,
			distributionInterval: { min: 7, max: 7 },
			intervalToSpawn: undefined,
			hitbox: { top: 0, left: 0, width: 23, height: 11 }
		},
		{
			className: 'bush',
			construct: undefined,
			distributionInterval: { min: 5, max: 8 },
			intervalToSpawn: undefined,
			hitbox: { top: 14, left: 0, width: 22, height: 13 }
		},
		{
			className: 'log',
			construct: undefined,
			distributionInterval: { min: 10, max: 12 },
			intervalToSpawn: undefined,
			hitbox: { top: 0, left: 0, width: 16, height: 11 }
		},
		{
			className: 'mushroom',
			construct: undefined,
			distributionInterval: { min: 60, max: 100 },
			intervalToSpawn: undefined,
			hitbox: { top: -5, left: -5, width: 13, height: 16 }
		},
		{
			className: 'tree',
			construct: undefined,
			distributionInterval: { min: 1, max: 1 },
			intervalToSpawn: undefined,
			hitbox: { top: 16, left: 5, width: 23, height: 16 }
		}
	];

	function getInterval(obData) {
		return Math.round(randomRange(obData.distributionInterval.min, obData.distributionInterval.max));
	}

	function translatedHitbox(pos, hitbox) {
		return {
			top: pos.y + hitbox.top / PIXELS_PER_METER,
			left: pos.x + hitbox.left / PIXELS_PER_METER,
			width: hitbox.width / PIXELS_PER_METER,
			height: hitbox.height / PIXELS_PER_METER
		};
	}

	const OBSTACLE_HASH = {};

	for (let i = 0; i < obstacleData.length; ++i) {
		let data = obstacleData[i];
		data.intervalToSpawn = getInterval(data);
		OBSTACLE_HASH[data.className] = data;
	}

	var gameLoop;
	var mountain;
	var skier;

	var distanceTraveled = 0;
	var panelSpeed = 0;
	var panelHealth = INITIAL_HEALTH;
	var updatePanelLoop;

	function updatePanel() {
		let panel = document.getElementById('panel');
		let color = (panelHealth == 0)? 'style="color:red"' : '';

		panel.innerHTML =`<strong>Distance:</strong> ${distanceTraveled} m<br/>
			<strong>Speed:</strong> ${panelSpeed} m/s<br/>
			<strong ${color}>Health:</strong> ${panelHealth}/${INITIAL_HEALTH}<br/>`;
	}

	function updatePanelDistance() {
		distanceTraveled = Math.round(skier.distanceTraveled * PIXELS_PER_METER);
		updatePanel();
	}

	var obstacles = new Set();
	let toRemove = new Set();
	var generatedChunks = {};

	function addObstacle(o) {
		obstacles.add(o);
	}

	function markForRemoval(o) {
		toRemove.add(o);
	}

	function removeObstacle(o) {
		o.cleanUp();
		obstacles.delete(o);
	}

	function chunkWasGenerated(chunkPos) {
		let set = generatedChunks[chunkPos.x];

		if (set != undefined) {
			if (set.has(chunkPos.y)) {
				return true;
			}
		}

		return false;
	}

	function registerChunk(chunkPos) {
		let set = generatedChunks[chunkPos.x];
		
		if (set == undefined) {
			set = generatedChunks[chunkPos.x] = new Set();
		}

		set.add(chunkPos.y);
	}

	function generateChunk(chunkPos, objPos) {
		if (chunkWasGenerated(chunkPos)) {
			return;
		}

		// Place obstacles on the quadrants

		let chunkTopLeft = {
			x: chunkPos.x * CHUNK_SIZE.width,
			y: chunkPos.y * CHUNK_SIZE.height
		};

		for (let qy = 0; qy < QUADRANTS_PER_CHUNK.y; ++qy) {
			for (let qx = 0; qx < QUADRANTS_PER_CHUNK.x; ++qx) {
				let quadrantCenter = {
					x: chunkTopLeft.x + (qx + 0.5) * QUADRANT_SIZE.width,
					y: chunkTopLeft.y + (qy + 0.5) * QUADRANT_SIZE.height
				};
				
				let halfQuadrantSize = {
					width: QUADRANT_SIZE.width / 2,
					height: QUADRANT_SIZE.height / 2
				};

				let spawnPos = {
					x: quadrantCenter.x + randomRange(-halfQuadrantSize.width, halfQuadrantSize.width),
					y: quadrantCenter.y + randomRange(-halfQuadrantSize.height, halfQuadrantSize.height)
				};

				if (vecDistance(objPos, spawnPos) <= MIN_OBSTACLE_SPAWN_DISTANCE) {
					continue;
				}

				obstacleToSpawn = undefined;

				for (let i = 0; i < obstacleData.length; ++i) {
					let data = obstacleData[i];

					if (data.intervalToSpawn > 0) {
						--data.intervalToSpawn;
					}

					if (data.intervalToSpawn <= 0 && obstacleToSpawn == undefined) {
						obstacleToSpawn = data;
						data.intervalToSpawn = getInterval(data);
					}
				}

				addObstacle(new obstacleToSpawn.construct(spawnPos, obstacleToSpawn));
			}
		}

		registerChunk(chunkPos);
	}

	function getCurChunk(pos) {
		return {
			x: Math.floor(pos.x / CHUNK_SIZE.width),
			y: Math.floor(pos.y / CHUNK_SIZE.height)
		};
	}

	function getRelativePosition(obj, skier) {
		return {
			top: (obj.globalPos.y - skier.globalPos.y) * PIXELS_PER_METER + SKIER_LOCATION.top,
			left: (obj.globalPos.x - skier.globalPos.x) * PIXELS_PER_METER + SKIER_LOCATION.left
		};
	}

	function updateGraphics(obj) {
		let screenLocation = getRelativePosition(obj, skier);

		obj.top = screenLocation.top;
		obj.left = screenLocation.left;

		obj.element.style.top = parseInt(obj.top) + "px";
		obj.element.style.left = parseInt(obj.left) + "px";

		obj.updateGraphics();
	}

	window.addEventListener('keydown', function (e) {
		if (!skier.falling) {
			if (e.key == 's') {
				skier.setDirection(FORWARD);
				skier.angle = DIR_ANGLES[FORWARD];
			}
			else if (e.key == 'a') {
				skier.changeDirection(-1);
			}
			else if (e.key == 'd') {
				skier.changeDirection(+1);
			}

			if (e.key == 'f') {
				skier.turboMode = !skier.turboMode;
			}
		}
	});

	function Mountain() {
		this.element = document.getElementById("mountain");
		this.element.style.width = TAMX + "px";
		this.element.style.height = TAMY + "px";
	}

	function BasicObstacle(pos, obData) {
		this.element = document.createElement('div');
		mountain.element.appendChild(this.element);
		this.element.className = obData.className;
		this.element.style.zIndex = 2000;
		
		this.top = 0;
		this.left = 0;
		this.hitbox = obData.hitbox;

		this.globalPos = {
			x: pos.x,
			y: pos.y
		};

		this.getHitbox = function() {
			return translatedHitbox(this.globalPos, this.hitbox);
		}

		this.onCollision = function(skier) {
			skier.collide(1);
			this.hitbox = INVALID_HITBOX;
		}

		this.updateGraphics = function() {

		}

		this.move = function() {

		}

		this.cleanUp = function() {
			this.element.parentNode.removeChild(this.element);
		}
	}

	OBSTACLE_HASH['tree'].construct = BasicObstacle;
	OBSTACLE_HASH['tall-tree'].construct = BasicObstacle;
	OBSTACLE_HASH['log'].construct = BasicObstacle;
	OBSTACLE_HASH['rock'].construct = BasicObstacle;

	function Bush(pos, obData) {
		let rand = Math.random() * 1;
		this.burning = FLAMING_BUSH_PROB > rand;
		let className = this.burning? 'flaming-bush' : 'bush';
		
		this.element = document.createElement('div');
		mountain.element.appendChild(this.element);
		this.element.className = className;
		this.element.style.zIndex = 2000;
		
		this.top = 0;
		this.left = 0;
		this.hitbox = obData.hitbox;

		this.globalPos = {
			x: pos.x,
			y: pos.y
		};

		this.getHitbox = function() {
			return translatedHitbox(this.globalPos, this.hitbox);
		}

		this.onCollision = function(skier) {
			skier.collide(this.burning? 2 : 1);
			this.hitbox = INVALID_HITBOX;
		}

		this.updateGraphics = function() {

		}

		this.move = function() {

		}

		this.cleanUp = function() {
			this.element.parentNode.removeChild(this.element);
		}
	}

	OBSTACLE_HASH['bush'].construct = Bush;

	function Mushroom(pos, obData) {
		this.element = document.createElement('div');
		mountain.element.appendChild(this.element);
		this.element.className = obData.className;
		this.element.style.zIndex = 2000;
		
		this.top = 0;
		this.left = 0;

		this.globalPos = {
			x: pos.x,
			y: pos.y
		};

		this.hitbox = obData.hitbox;

		this.getHitbox = function() {
			return translatedHitbox(this.globalPos, this.hitbox);
		}

		this.onCollision = function(skier) {
			skier.addHealth(1);
			this.hitbox = INVALID_HITBOX;
			markForRemoval(this);
		}

		this.updateGraphics = function() {

		}

		this.move = function() {

		}

		this.cleanUp = function() {
			this.element.parentNode.removeChild(this.element);
		}
	}

	OBSTACLE_HASH['mushroom'].construct = Mushroom;

	function Dog(pos, dir) {
		this.element = document.createElement('div');
		mountain.element.appendChild(this.element);
		this.element.className = 'dog-walk';
		this.element.style.zIndex = 2000;
		this.element.style.transform = `scaleX(${parseInt(dir)})`

		this.top = 0;
		this.left = 0;

		this.speedX = dir * DOG_SPEED;
		this.hitbox = DOG_HITBOX;

		this.globalPos = {
			x: pos.x,
			y: pos.y
		};

		this.getHitbox = function() {
			return translatedHitbox(this.globalPos, this.hitbox);
		}

		this.onCollision = function(skier) {
			skier.collide(1);
			this.hitbox = INVALID_HITBOX;
		}

		this.updateGraphics = function() {

		}

		this.move = function() {
			this.globalPos.x += this.speedX;
		}

		this.cleanUp = function() {
			this.element.parentNode.removeChild(this.element);
		}
	}

	function Yeti(skier) {
		this.element = document.createElement('div');
		mountain.element.appendChild(this.element);
		this.element.className = 'yeti-run';
		this.element.style.zIndex = 2000;

		let dir = Math.round(Math.random());
		if (dir == 0) dir = -1;

		this.top = 0;
		this.left = 0;

		this.hitbox = YETI_HITBOX;
		this.globalPos = {
			x: skier.globalPos.x - YETI_DISTANCE.x[Math.round(Math.random())],
			y: skier.globalPos.y + YETI_DISTANCE.y[Math.round(Math.random())]
		};

		this.skier = skier;
		this.victorious = false;

		this.getHitbox = function() {
			return translatedHitbox(this.globalPos, this.hitbox);
		}

		this.onCollision = function(skier) {
			if (!this.victorious && !skier.dead) {
				skier.die();
				this.hitbox = INVALID_HITBOX;
				this.victorious = true;
				this.element.className = 'yeti-eat';
				let yeti = this;
				setTimeout(function() {
					yeti.element.className = 'yeti-pick';
				}, 400);
			}
		}

		this.updateGraphics = function() {
			if (this.top <= -100) {
				markForRemoval(this);
			}

			let dir = this.skier.globalPos.x - this.globalPos.x;
			if (this.skier.dead && !this.victorious) dir *= -1;
			this.element.style.transform = `scaleX(${(dir < 0)? -1 : 1})`;
		}

		this.move = function(skier) {
			if (this.victorious) {
				return;
			}

			let delta = {
				x: skier.globalPos.x - this.globalPos.x,
				y: skier.globalPos.y - this.globalPos.y
			};

			let rad = Math.atan2(delta.y, delta.x);

			let speedX = Math.cos(rad) * YETI_SPEED;
			let speedY = Math.sin(rad) * YETI_SPEED;

			if (this.skier.dead) {
				speedX *= -1;
			}

			this.globalPos.x += speedX;
			this.globalPos.y += speedY;
		}

		this.cleanUp = function() {
			this.element.parentNode.removeChild(this.element);
		}
	}

	function Skier() {
		this.element = document.getElementById("skier");

		this.dir = INITIAL_DIR;
		this.top = 0; // Shorthand for the element's top
		this.left = 0; // Shorthand for the element's left
		this.globalPos = { x: SKIER_INITIAL_POS.x, y: SKIER_INITIAL_POS.y };
		this.speed = 0;
		this.maxSpeed = 0;
		this.angle = DIR_ANGLES[this.dir];
		this.goalAngle = 0;
		this.speedX = 0;
		this.speedY = 0;
		this.turboMode = false;
		this.curChunk = { x: undefined, y: undefined };
		this.distanceTraveled = 0;
		this.health = INITIAL_HEALTH;
		this.hitbox = SKIER_HITBOX;
		this.falling = false;
		this.invincibility = false;
		this.timeout = undefined;
		this.dead = false;

		this.changeDirection = function (turn) {
			this.dir += turn;

			if (this.dir < MIN_DIR) {
				this.dir = MIN_DIR;
			}
			else if (this.dir > MAX_DIR) {
				this.dir = MAX_DIR;
			}
		};

		this.getHitbox = function() {
			return translatedHitbox(this.globalPos, this.hitbox);
		}

		this.updatePanel = function() {
			panelSpeed = Math.round(this.speedY * FPS);
			panelHealth = this.health;

			updatePanel();
		}

		this.setDirection = function (dir) {
			this.dir = dir;
		}

		this.addHealth = function(amount) {
			this.health += amount;
			if (this.health > INITIAL_HEALTH) this.health = INITIAL_HEALTH;
		}

		this.collide = function(damage) {
			if (!this.falling && !this.invincibility) {
				this.falling = true;
				this.turboMode = false;
				
				this.health -= damage;
				
				if (this.health < 0) {
					this.health = 0;
					this.dead = true;
				}
			}
		}

		this.die = function() {
			this.element.style.opacity = 0;
			this.falling = this.dead = true;
			this.speed = this.maxSpeed = 0;
		}

		this.getUp = function() {
			if (this.dead) return;

			this.falling = false;
			this.invincibility = true;

			this.setDirection(FORWARD);
			this.angle = DIR_ANGLES[this.dir];

			let skier = this;

			setTimeout(function() {
				skier.invincibility = false;
			}, INVINCIBILITY_DURATION);
		}

		this.updateSpeed = function () {
			if (this.dir == MIN_DIR || this.dir == MAX_DIR || this.falling) {
				this.maxSpeed = 0;
			}
			else if (this.turboMode) {
				this.maxSpeed = TURBO_MAX_SPEED;
			}
			else {
				this.maxSpeed = MAX_SPEED;
			}

			if (this.speed < this.maxSpeed) {
				this.speed = Math.min(this.speed + ACCEL, this.maxSpeed);
			}
			else if (this.speed > this.maxSpeed) {
				this.speed = Math.max(this.speed - ACCEL, this.maxSpeed);
			}

			if (this.falling && this.speed == 0 && this.timeout == undefined && !this.dead) {
				let skier = this;

				this.timeout = setTimeout(function() {
					skier.timeout = undefined;
					skier.getUp();
				}, DOWN_DURATION);
			}

			if (this.speed != this.maxSpeed) console.log("speed change", this.speed, this.maxSpeed);

			this.goalAngle = DIR_ANGLES[this.dir];

			if (this.angle < this.goalAngle) {
				this.angle = Math.min(this.angle + ANGLE_ACCEL, this.goalAngle);
			}
			else if (this.angle > this.goalAngle) {
				this.angle = Math.max(this.angle - ANGLE_ACCEL, this.goalAngle);
			}

			if (this.angle != this.goalAngle) console.log("angle change", this.angle);

			let rad = degToRadian(this.angle);

			this.speedX = Math.cos(rad) * this.speed;
			this.speedY = Math.sin(rad) * -this.speed;
		}

		this.move = function () {
			this.updateSpeed();

			this.globalPos.x += this.speedX;
			this.globalPos.y += this.speedY;

			this.distanceTraveled += this.speedY;
		}

		this.updateChunks = function () {
			let prevChunk = this.curChunk;
			this.curChunk = getCurChunk(this.globalPos);

			if (this.curChunk.x != prevChunk.x || this.curChunk.y != prevChunk.y) {
				let begin = {
					x: this.curChunk.x - 2,
					y: this.curChunk.y
				};

				let end = {
					x: this.curChunk.x + 2,
					y: this.curChunk.y + 2
				};
				
				let iter = { x: 0, y: 0 };

				for (iter.y = begin.y; iter.y <= end.y; ++iter.y) {
					for (iter.x = begin.x; iter.x <= end.x; ++iter.x) {
						generateChunk(iter, this.globalPos);
					}
				}
			}
		}

		this.updateGraphics = function () {
			if (this.falling) {
				if (this.speed == 0 && this.dead) {
					this.element.className = SKIER_DEAD_CLASS;
				}
				else {
					this.element.className = SKIER_FALLING_CLASS;
				}
			}
			else {
				this.element.className = DIR_CLASSES[this.dir];
			}

			if (this.invincibility && !this.dead) {
				this.element.style.opacity = 0.5;
			}
			else if (!this.dead) {
				this.element.style.opacity = 1.0;
			}
		}
	}

	function spawnDog() {
		let dir = Math.round(Math.random());
		if (dir == 0) dir = -1;

		let dogSpeed = DOG_SPEED * dir;

		let distY = MIN_DOG_SPAWN_Y_DISTANCE;

		let ticksToDistY = MIN_DOG_SPAWN_Y_DISTANCE / skier.speedY;
		let skierTraveledX = skier.speedX * ticksToDistY;
		let distX = ticksToDistY * -dogSpeed + skierTraveledX;

		let pos = {
			x: skier.globalPos.x + distX,
			y: skier.globalPos.y + distY
		};

		addObstacle(new Dog(pos, dir));
	}

	function init() {
		gameLoop = setInterval(run, 1000 / FPS);
		updatePanelLoop = setInterval(updatePanelDistance, 500);

		mountain = new Mountain();
		skier = new Skier();
	}

	function randomDogTime() {
		return Math.round(DOG_SPAWN_INTERVAL.min, DOG_SPAWN_INTERVAL.max);
	}

	var dogCounter = randomDogTime();
	var nextYetiSpawn = YETI_SPAWN_MILESTONE;

	function run() {
		if (skier.dead) {
			document.getElementById('gameover').style.opacity = 1;
		}

		skier.updateChunks();
		skier.move();
		skier.updatePanel();
		updateGraphics(skier);

		if (distanceTraveled >= nextYetiSpawn) {
			addObstacle(new Yeti(skier));
			nextYetiSpawn += YETI_SPAWN_MILESTONE;
		}

		if (skier.speedY > 0 && --dogCounter <= 0) {
			spawnDog();
			dogCounter = randomDogTime();
		}

		let skierHitbox = skier.getHitbox();

		obstacles.forEach(function(o) {
			let obHitbox = o.getHitbox();
			
			if (hitboxesIntersect(skier, o)) {
				o.onCollision(skier);
			}
		});

		obstacles.forEach(function(o) {
			o.move(skier);
			updateGraphics(o);

			let obsChunk = getCurChunk(o.globalPos);

			if (obsChunk.y < skier.curChunk.y - 1) {
				markForRemoval(o);
			}
		});

		toRemove.forEach(removeObstacle);
		toRemove.clear();
	}

	init();
})();