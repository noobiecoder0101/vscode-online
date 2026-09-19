INSERT INTO categories (slug, name, icon) VALUES
  ('gaming', 'Gaming Communities', '🎮'),
  ('careers', 'Careers & Professional Networking', '💼'),
  ('technology', 'Software Development & Technology', '💻'),
  ('dating', 'Dating & Social Connections', '❤️'),
  ('education', 'Education & Study Groups', '📚');

INSERT INTO communities (category_id, name, description, platform, member_count, invite_link, image_url) VALUES
  ((SELECT id FROM categories WHERE slug = 'gaming'), 'Pixel Pioneers', 'A friendly hub for co-op games, weekly sessions, and new teammates.', 'discord', 1840, 'https://discord.gg/example-pixel-pioneers', NULL),
  ((SELECT id FROM categories WHERE slug = 'gaming'), 'Mobile Match Night', 'Casual mobile gamers sharing tips and organising weekend matches.', 'telegram', 920, 'https://t.me/example-mobile-match-night', NULL),
  ((SELECT id FROM categories WHERE slug = 'gaming'), 'Lagos Console Crew', 'Console players discussing releases and planning local game nights.', 'whatsapp', 480, 'https://chat.whatsapp.com/example-lagos-console-crew', NULL);

INSERT INTO communities (category_id, name, description, platform, member_count, invite_link, image_url) VALUES
  ((SELECT id FROM categories WHERE slug = 'careers'), 'Career Builders Network', 'Professionals sharing job leads, interview advice, and accountability.', 'telegram', 3260, 'https://t.me/example-career-builders-network', NULL),
  ((SELECT id FROM categories WHERE slug = 'careers'), 'Remote Work Circle', 'A peer group for remote-work opportunities, tools, and routines.', 'discord', 1575, 'https://discord.gg/example-remote-work-circle', NULL),
  ((SELECT id FROM categories WHERE slug = 'careers'), 'Young Professionals Connect', 'Early-career professionals exchanging mentorship and event updates.', 'whatsapp', 710, 'https://chat.whatsapp.com/example-young-professionals-connect', NULL);

INSERT INTO communities (category_id, name, description, platform, member_count, invite_link, image_url) VALUES
  ((SELECT id FROM categories WHERE slug = 'technology'), 'JavaScript Study Lab', 'Developers learning JavaScript together through small weekly projects.', 'discord', 4120, 'https://discord.gg/example-javascript-study-lab', NULL),
  ((SELECT id FROM categories WHERE slug = 'technology'), 'Cloud Builders Africa', 'Cloud practitioners sharing tutorials, events, and certification advice.', 'telegram', 2340, 'https://t.me/example-cloud-builders-africa', NULL),
  ((SELECT id FROM categories WHERE slug = 'technology'), 'No-Code Makers', 'A practical community for prototyping apps without traditional coding.', 'whatsapp', 640, 'https://chat.whatsapp.com/example-no-code-makers', NULL);

INSERT INTO communities (category_id, name, description, platform, member_count, invite_link, image_url) VALUES
  ((SELECT id FROM categories WHERE slug = 'dating'), 'Coffee & Conversation', 'A respectful social space for making genuine connections.', 'whatsapp', 835, 'https://chat.whatsapp.com/example-coffee-conversation', NULL),
  ((SELECT id FROM categories WHERE slug = 'dating'), 'Bookish Singles Club', 'Readers discussing books, meetups, and thoughtful introductions.', 'telegram', 1190, 'https://t.me/example-bookish-singles-club', NULL),
  ((SELECT id FROM categories WHERE slug = 'dating'), 'New Friends Weekend', 'A moderated community for local social plans and friendships.', 'discord', 680, 'https://discord.gg/example-new-friends-weekend', NULL);

INSERT INTO communities (category_id, name, description, platform, member_count, invite_link, image_url) VALUES
  ((SELECT id FROM categories WHERE slug = 'education'), 'Study Sprint Collective', 'Students hosting focused study sessions and sharing learning resources.', 'discord', 2980, 'https://discord.gg/example-study-sprint-collective', NULL),
  ((SELECT id FROM categories WHERE slug = 'education'), 'Scholarship Alert Desk', 'A place to exchange scholarship deadlines and application guidance.', 'telegram', 3640, 'https://t.me/example-scholarship-alert-desk', NULL),
  ((SELECT id FROM categories WHERE slug = 'education'), 'Exam Prep Partners', 'Study partners coordinating revision plans and practice questions.', 'whatsapp', 760, 'https://chat.whatsapp.com/example-exam-prep-partners', NULL);
