-- Poker Club Database Schema

CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  host_id UUID REFERENCES players(id),
  game_type TEXT CHECK (game_type IN ('holdem', 'omaha', 'mixed')),
  small_blind INT NOT NULL,
  big_blind INT NOT NULL,
  min_buy_in INT NOT NULL,
  max_buy_in INT NOT NULL,
  max_players INT DEFAULT 9,
  status TEXT DEFAULT 'waiting',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id),
  table_id UUID REFERENCES tables(id),
  buy_in_total INT DEFAULT 0,
  cash_out_total INT DEFAULT 0,
  hands_played INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id),
  table_id UUID REFERENCES tables(id),
  session_id UUID REFERENCES sessions(id),
  type TEXT CHECK (type IN ('buy_in', 'cash_out', 'transfer', 'adjustment')),
  amount INT NOT NULL,
  balance_after INT NOT NULL,
  confirmed_by UUID REFERENCES players(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE hand_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID REFERENCES tables(id),
  hand_number INT NOT NULL,
  game_type TEXT NOT NULL,
  players JSONB,
  hole_cards JSONB,
  community_cards JSONB,
  actions JSONB,
  pots JSONB,
  winners JSONB,
  run_it_twice BOOLEAN DEFAULT FALSE,
  board_runs JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chip_in_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_player_id UUID REFERENCES players(id),
  to_player_id UUID REFERENCES players(id),
  session_id UUID REFERENCES sessions(id),
  amount INT NOT NULL,
  method TEXT CHECK (method IN ('venmo', 'zelle', 'cash', 'other')),
  confirmed BOOLEAN DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_ledger_player ON ledger(player_id);
CREATE INDEX idx_ledger_table ON ledger(table_id);
CREATE INDEX idx_ledger_session ON ledger(session_id);
CREATE INDEX idx_hand_history_table ON hand_history(table_id, hand_number);
CREATE INDEX idx_sessions_player ON sessions(player_id);
CREATE INDEX idx_sessions_table ON sessions(table_id);
CREATE INDEX idx_chip_in_from ON chip_in_records(from_player_id);
CREATE INDEX idx_chip_in_to ON chip_in_records(to_player_id);

-- RLS Policies
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE hand_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE chip_in_records ENABLE ROW LEVEL SECURITY;

-- Players: read all, update own
CREATE POLICY "Anyone can read players" ON players FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON players FOR UPDATE USING (auth.uid() = id);

-- Tables: read all
CREATE POLICY "Anyone can read tables" ON tables FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create tables" ON tables FOR INSERT WITH CHECK (auth.uid() = host_id);

-- Sessions: read own
CREATE POLICY "Players can read own sessions" ON sessions FOR SELECT USING (auth.uid() = player_id);

-- Ledger: read entries for own tables
CREATE POLICY "Players can read own ledger" ON ledger FOR SELECT USING (auth.uid() = player_id);

-- Hand history: read for tables you played
CREATE POLICY "Players can read hand history" ON hand_history FOR SELECT USING (
  EXISTS (SELECT 1 FROM sessions WHERE sessions.table_id = hand_history.table_id AND sessions.player_id = auth.uid())
);

-- Chip-in records: read if involved
CREATE POLICY "Players can read own chip-in records" ON chip_in_records FOR SELECT USING (
  auth.uid() = from_player_id OR auth.uid() = to_player_id
);
