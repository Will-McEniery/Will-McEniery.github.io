// script.js
document.addEventListener('DOMContentLoaded', function() {
    // Navigation functionality
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.section');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all links and sections
            navLinks.forEach(l => l.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            
            // Add active class to clicked link
            this.classList.add('active');
            
            // Show corresponding section
            const targetId = this.getAttribute('href').substring(1);
            document.getElementById(targetId).classList.add('active');
        });
    });
    
    // Grid background initialization
    const canvas = document.getElementById('grid-canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size to window size
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Grid parameters
    const gridSize = 40;
    const waveAmplitude = 5;
    const waveSpeed = 0.1;
    const damping = 0.95;
    
    // Grid state
    let grid = [];
    let mouse = { x: 0, y: 0, radius: 100, isDown: false };
    
    // Initialize grid
    function initGrid() {
        grid = [];
        const cols = Math.ceil(canvas.width / gridSize);
        const rows = Math.ceil(canvas.height / gridSize);
        
        for (let y = 0; y < rows; y++) {
            grid[y] = [];
            for (let x = 0; x < cols; x++) {
                grid[y][x] = {
                    x: x * gridSize,
                    y: y * gridSize,
                    originalY: y * gridSize,
                    displacement: 0
                };
            }
        }
    }
    
    // Mouse event handlers
    canvas.addEventListener('mousemove', function(e) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });
    
    canvas.addEventListener('mousedown', function() {
        mouse.isDown = true;
    });
    
    canvas.addEventListener('mouseup', function() {
        mouse.isDown = false;
    });
    
    // Draw grid
    function drawGrid() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        
        // Vertical lines
        for (let x = 0; x < canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        
        // Horizontal lines
        for (let y = 0; y < canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
        
        // Draw displaced grid points
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        for (let y = 0; y < grid.length; y++) {
            for (let x = 0; x < grid[y].length; x++) {
                const point = grid[y][x];
                const displacedY = point.originalY + point.displacement;
                
                // Draw point
                ctx.beginPath();
                ctx.arc(point.x, displacedY, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    // Update grid physics
    function updateGrid() {
        const cols = grid[0].length;
        const rows = grid.length;
        
        // Apply mouse interaction
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const point = grid[y][x];
                const dx = point.x - mouse.x;
                const dy = point.y - mouse.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < mouse.radius) {
                    const force = (mouse.radius - distance) / mouse.radius;
                    if (mouse.isDown) {
                        point.displacement += force * waveAmplitude * 2;
                    } else {
                        point.displacement += force * waveAmplitude;
                    }
                }
            }
        }
        
        // Apply wave propagation
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const point = grid[y][x];
                
                // Apply damping
                point.displacement *= damping;
                
                // Apply wave propagation from neighbors
                if (y > 0 && y < rows - 1 && x > 0 && x < cols - 1) {
                    const left = grid[y][x - 1].displacement;
                    const right = grid[y][x + 1].displacement;
                    const top = grid[y - 1][x].displacement;
                    const bottom = grid[y + 1][x].displacement;
                    
                    const avg = (left + right + top + bottom) / 4;
                    point.displacement += (avg - point.displacement) * waveSpeed;
                }
            }
        }
    }
    
    // Animation loop
    function animate() {
        updateGrid();
        drawGrid();
        requestAnimationFrame(animate);
    }
    
    // Initialize and start animation
    initGrid();
    animate();
    
    // Project typing animation
    const projectItems = document.querySelectorAll('.project-item');
    
    projectItems.forEach(item => {
        const details = item.querySelector('.project-details');
        if (details) {
            // Add typing effect to project details
            const text = details.innerHTML;
            details.innerHTML = '<span class="typing-text">' + text + '</span>';
        }
    });
});
