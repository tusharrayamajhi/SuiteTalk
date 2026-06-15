-- SuiteTalk Database Initialization
-- Requirement: PostgreSQL with pgvector extension

CREATE EXTENSION IF NOT EXISTS vector;

-- Rooms Table
CREATE TABLE IF NOT EXISTS rooms (
    room_number VARCHAR(10) PRIMARY KEY,
    room_type VARCHAR(50),
    guest_name VARCHAR(100),
    status VARCHAR(20) DEFAULT 'occupied' -- occupied, vacant, cleaning
);

-- Service Requests Table
CREATE TABLE IF NOT EXISTS requests (
    id SERIAL PRIMARY KEY,
    room_number VARCHAR(10) REFERENCES rooms(room_number),
    request_type VARCHAR(50), -- housekeeping, kitchen, maintenance, concierge
    description TEXT,
    urgency VARCHAR(20) DEFAULT 'normal', -- normal, high, immediate
    status VARCHAR(20) DEFAULT 'pending', -- pending, in_progress, completed, cancelled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge Base for AI Semantic Search
CREATE TABLE IF NOT EXISTS knowledge_base (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    category VARCHAR(50), -- policy, faq, local_info
    embedding vector(768) -- Adjusted for Google Gemini text-embedding-004
);

-- Kitchen Menu Table
CREATE TABLE IF NOT EXISTS menu (
    id SERIAL PRIMARY KEY,
    item_name VARCHAR(100) NOT NULL,
    category VARCHAR(50), -- breakfast, lunch, dinner, drinks
    price DECIMAL(10, 2),
    description TEXT,
    available BOOLEAN DEFAULT TRUE
);

-- Seed some rooms
INSERT INTO rooms (room_number, room_type, guest_name) VALUES 
('101', 'Standard', 'John Doe'),
('102', 'Standard', 'Jane Smith'),
('201', 'Deluxe', 'Alice Johnson'),
('301', 'Suite', 'Bob Brown')
ON CONFLICT (room_number) DO NOTHING;

-- Seed some menu items
INSERT INTO menu (item_name, category, price, description) VALUES
('Club Sandwich', 'lunch', 15.00, 'Classic club sandwich with fries'),
('Margherita Pizza', 'dinner', 18.50, 'Fresh tomato and mozzarella'),
('Greek Salad', 'lunch', 12.00, 'Fresh greens with feta and olives'),
('Eggs Benedict', 'breakfast', 14.00, 'Poached eggs with hollandaise sauce')
ON CONFLICT DO NOTHING;
