// ============ TASK LIBRARY ============
// Edit freely. Each task: [name, roughly-every-N-days, days it can happen (null = any; 0=Sun ... 6=Sat), minutes it takes, energy 1-3]
// Add a new category by adding a new key. Renaming a task changes its id, so it restarts its history.
window.TASK_LIBRARY = {
  Body: [
    ["Stretch 10 min", 1, null, 10, 1], ["Swim", 3, [1, 3, 5], 60, 3], ["Strength session", 3, [2, 4, 6], 60, 3],
    ["Walk without phone", 2, null, 30, 1], ["Mobility / foam roll", 4, null, 15, 1], ["Long walk (1h+)", 7, [0, 6], 75, 2],
    ["Run 5k", 4, null, 35, 3], ["Cycle somewhere", 7, null, 60, 2], ["Yoga video", 4, null, 25, 2],
    ["Cold shower finish", 2, null, 2, 2], ["Weigh in", 7, [1], 1, 1], ["Log workouts for the week", 7, [0], 10, 1],
    ["Book physio / massage", 60, null, 5, 1], ["Dentist check-up booked?", 180, null, 5, 1], ["Eye test booked?", 365, null, 5, 1],
    ["Take vitamins", 1, null, 1, 1], ["10k steps", 1, null, 60, 2], ["Sauna / steam", 14, null, 45, 1],
    ["Push-up / pull-up mini set", 2, null, 5, 2], ["Check in on any niggles", 7, null, 5, 1],
  ],
  Sleep: [
    ["In bed by 11", 1, null, 1, 1], ["No screens after 10pm", 1, null, 1, 1], ["Wake at the same time", 1, null, 1, 1],
    ["No caffeine after 2pm", 1, null, 1, 1], ["Change pillowcase", 7, null, 3, 1], ["Air the bedroom", 3, null, 2, 1],
  ],
  Food: [
    ["Cook a proper dinner", 2, null, 45, 2], ["Batch cook for the week", 7, [0], 90, 3], ["Big food shop", 7, [0, 6], 60, 2],
    ["Top-up shop", 3, null, 20, 1], ["Plan meals for the week", 7, [0, 6], 15, 1], ["Try a new recipe", 10, null, 60, 2],
    ["Clear out fridge", 14, null, 15, 1], ["Eat 5 veg today", 1, null, 1, 1], ["Drink 2L water", 1, null, 1, 1],
    ["No takeaway this week", 7, null, 1, 1], ["Make lunch instead of buying", 2, [1, 2, 3, 4, 5], 15, 1],
    ["Bake something", 21, [0, 6], 90, 2], ["Check cupboard dates", 60, null, 15, 1], ["Sharpen kitchen knives", 90, null, 15, 1],
  ],
  Home: [
    ["Tidy desk", 2, null, 5, 1], ["Make the bed", 1, null, 2, 1], ["Wash up / dishwasher", 1, null, 10, 1],
    ["Wipe kitchen surfaces", 2, null, 5, 1], ["Hoover living room", 7, null, 15, 2], ["Hoover bedroom", 10, null, 10, 2],
    ["Mop kitchen floor", 14, null, 15, 2], ["Clean bathroom", 10, null, 25, 2], ["Clean the loo", 5, null, 5, 1],
    ["Change bed sheets", 10, [0, 6], 15, 2], ["Wash towels", 7, null, 10, 1], ["Laundry", 4, null, 15, 1],
    ["Put laundry away", 4, null, 10, 1], ["Iron shirts", 7, [0], 30, 2], ["Take bins out", 7, null, 5, 1],
    ["Recycling out", 14, null, 5, 1], ["Water plants", 5, null, 5, 1], ["Feed / repot plants", 60, null, 20, 2],
    ["Descale kettle", 60, null, 10, 1], ["Clean microwave", 21, null, 10, 1], ["Clean oven", 90, null, 45, 3],
    ["Clean fridge inside", 45, null, 25, 2], ["Wipe skirting boards", 60, null, 30, 2], ["Clean windows", 90, null, 45, 2],
    ["Dust shelves", 14, null, 15, 1], ["Declutter one drawer", 14, null, 15, 1], ["Sort the 'stuff' pile", 10, null, 20, 1],
    ["Clean shower head / limescale", 45, null, 15, 2], ["Wash the car", 30, [0, 6], 40, 2], ["Check smoke alarm", 90, null, 2, 1],
    ["Bleed radiators", 180, null, 20, 2], ["Wash bath mat", 14, null, 5, 1], ["Hoover under sofa", 60, null, 15, 2],
    ["Clear email / post pile by the door", 7, null, 10, 1], ["Wash reusable bags", 60, null, 5, 1],
  ],
  Admin: [
    ["Inbox to zero", 3, null, 20, 2], ["Check bank & card statements", 7, null, 10, 1], ["Pay / review bills", 30, null, 15, 1],
    ["Weekly review", 7, [0, 1], 30, 2], ["Plan tomorrow", 1, null, 5, 1], ["Back up laptop", 30, null, 5, 1],
    ["Back up phone photos", 30, null, 10, 1], ["Review subscriptions", 90, null, 15, 1], ["Update passwords / 2FA check", 120, null, 20, 2],
    ["File receipts", 14, null, 10, 1], ["Check pension / ISA", 60, null, 15, 2], ["Renew anything expiring?", 30, null, 10, 1],
    ["Return / cancel anything pending", 14, null, 10, 1], ["Clear phone notifications & apps", 30, null, 10, 1],
    ["Update budget", 7, [0, 1], 15, 2], ["Check calendar for next 2 weeks", 7, [0], 5, 1], ["Sort out a nagging admin thing", 5, null, 20, 2],
    ["Read one T&C / letter properly", 14, null, 15, 1], ["Tax / HMRC check-in", 90, null, 20, 2], ["Check insurance renewals", 180, null, 15, 1],
  ],
  Mind: [
    ["Read 20 pages", 1, null, 20, 1], ["Journal", 2, null, 10, 1], ["Meditate 10 min", 2, null, 10, 1],
    ["Gratitude — 3 things", 1, null, 3, 1], ["No phone first 30 min", 1, null, 1, 1], ["Screen-free evening", 7, null, 120, 1],
    ["Long-form article", 4, null, 30, 1], ["Podcast episode on a walk", 4, null, 45, 1], ["Write a page of whatever", 7, null, 30, 2],
    ["Review goals for the quarter", 30, [0], 30, 2], ["Write down what's bugging you", 5, null, 10, 1], ["Do nothing for 15 min", 3, null, 15, 1],
    ["Learn something new (10 min)", 3, null, 10, 1], ["Museum / gallery", 45, [0, 6], 120, 2], ["Finish a book", 21, null, 90, 2],
    ["Chess puzzle / brain game", 3, null, 10, 1],
  ],
  People: [
    ["Call home", 7, [0], 30, 1], ["Message a friend you've not seen", 5, null, 5, 1], ["Plan something social", 10, null, 10, 2],
    ["Round of golf with Louis", 21, [0, 6], 240, 3], ["Send a thank-you / follow-up", 7, null, 10, 1], ["Reply to the message you've left", 2, null, 5, 1],
    ["Coffee with someone", 7, null, 60, 2], ["Check birthdays this month", 30, [0, 1], 5, 1], ["Send a card / present", 30, null, 20, 1],
    ["Visit family", 45, [0, 6], 240, 2], ["Host / cook for people", 30, [0, 6], 180, 3], ["Voice note a mate", 7, null, 5, 1],
    ["Say yes to an invite", 14, null, 1, 1], ["Grandparents / older relative call", 14, null, 20, 1], ["Catch-up with an ex-colleague", 30, [1, 2, 3, 4, 5], 60, 2],
  ],
  Study: [
    ["CFA: 1 reading", 2, null, 60, 3], ["CFA: question bank set", 2, null, 30, 2], ["CFA: flashcard review", 1, null, 15, 1],
    ["CFA: mock exam section", 14, [0, 6], 120, 3], ["CFA: review weak topics", 7, null, 45, 2], ["CFA: update study tracker", 7, [0], 10, 1],
    ["Felix Pro modelling session", 4, null, 60, 3], ["Rebuild a model from scratch", 21, null, 120, 3], ["Read one broker note properly", 3, null, 30, 2],
    ["Read a results release + call", 7, null, 45, 2], ["Practise Excel shortcuts 10 min", 3, null, 10, 1], ["Write up what you learned this week", 7, [0], 20, 2],
    ["Accounting concept deep-dive", 5, null, 30, 2], ["Watch a finance lecture", 7, null, 45, 2], ["Tableau refresher", 30, null, 45, 2],
    ["Python / automation practice", 5, null, 45, 2],
  ],
  "Job search": [
    ["Scan job boards", 2, null, 15, 1], ["Reach out to one contact", 3, [1, 2, 3, 4], 15, 2], ["Tailor CV for a live role", 7, [1, 2, 3, 4, 5], 60, 3],
    ["Interview prep session", 5, null, 45, 3], ["Update LinkedIn", 30, null, 20, 2], ["Follow up on an application", 4, [1, 2, 3, 4, 5], 10, 1],
    ["Research one target company", 4, null, 30, 2], ["Recruiter check-in", 7, [1, 2, 3, 4], 15, 2], ["Practise 'tell me about yourself'", 7, null, 15, 2],
    ["Update application tracker", 3, null, 10, 1], ["Write a cover letter", 7, [1, 2, 3, 4, 5], 45, 3], ["Ask for a reference / intro", 14, null, 10, 2],
    ["Read sector news for interviews", 2, null, 20, 1], ["Rehearse a case / model test", 10, null, 60, 3], ["Post something on LinkedIn", 14, [1, 2, 3, 4], 20, 2],
  ],
  Golf: [
    ["Range session", 7, null, 60, 2], ["Putting drill at home", 3, null, 15, 1], ["Book lesson with Dan", 45, null, 5, 1],
    ["Short game practice", 10, null, 45, 2], ["9 holes", 14, null, 120, 3], ["Watch swing video back", 7, null, 10, 1],
    ["Clean clubs", 30, null, 15, 1], ["Book a tee time", 14, null, 5, 1], ["Chipping in the garden", 5, null, 15, 1],
    ["Stretch for golf", 3, null, 10, 1],
  ],
  Money: [
    ["Move money to savings", 30, null, 5, 1], ["Check for a better rate", 90, null, 20, 2], ["Review last month's spending", 30, [0, 1], 20, 2],
    ["Sell something you don't use", 30, null, 30, 2], ["Check credit report", 120, null, 10, 1], ["Cancel one thing you don't use", 60, null, 10, 1],
    ["Set / review a savings goal", 90, null, 15, 2], ["Look at investments (don't fiddle)", 30, null, 15, 1],
  ],
  Fun: [
    ["Watch a film properly", 7, null, 120, 1], ["Game for an hour, guilt-free", 5, null, 60, 1], ["Go somewhere new in London", 14, [0, 6], 180, 2],
    ["Live music / comedy / sport", 30, null, 180, 2], ["Work on the sweepstakes app", 4, null, 90, 3], ["Cook something ambitious", 21, [0, 6], 120, 3],
    ["Day trip", 45, [0, 6], 360, 3], ["Photos — sort and pick favourites", 30, null, 30, 1], ["Plan a holiday / weekend away", 60, null, 45, 2],
    ["Try a new pub / café", 14, null, 90, 1], ["Read the paper cover to cover", 7, [0, 6], 60, 1], ["Listen to a new album", 5, null, 45, 1],
  ],
  Kit: [
    ["Charge everything", 3, null, 5, 1], ["Clean laptop screen & keyboard", 21, null, 10, 1], ["Clean phone", 7, null, 3, 1],
    ["Polish shoes", 30, null, 20, 1], ["Wash trainers", 45, null, 15, 1], ["Sort out wardrobe", 60, null, 45, 2],
    ["Drop off charity bag", 60, null, 20, 1], ["Replace worn-out thing", 30, null, 20, 1], ["Wash coat / jacket", 90, null, 10, 1],
    ["Check bike / tyres", 30, null, 15, 1], ["Sew on that button", 30, null, 15, 1], ["Update software everywhere", 30, null, 15, 1],
  ],
};

// Tasks you start with on first run. Format: "Category:Task name". Anything else waits in the Library.
window.STARTER_TASKS = [
  "Body:Stretch 10 min", "Body:Swim", "Body:Strength session", "Body:Walk without phone", "Home:Tidy desk", "Home:Hoover living room",
  "Home:Change bed sheets", "Home:Clean bathroom", "Home:Descale kettle", "Home:Water plants", "Food:Big food shop", "Food:Batch cook for the week",
  "Admin:Inbox to zero", "Admin:Check bank & card statements", "Admin:Weekly review", "Admin:Plan tomorrow", "Mind:Read 20 pages", "Mind:Journal",
  "People:Call home", "People:Message a friend you've not seen", "People:Round of golf with Louis", "Study:CFA: 1 reading", "Study:CFA: question bank set",
  "Study:CFA: flashcard review", "Study:Felix Pro modelling session", "Job search:Scan job boards", "Job search:Reach out to one contact",
  "Job search:Tailor CV for a live role", "Job search:Interview prep session", "Golf:Range session", "Golf:Putting drill at home",
];
