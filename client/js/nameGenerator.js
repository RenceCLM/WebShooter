// Random Name Generator
class NameGenerator {
  static adjectives = [
    'Swift', 'Fierce', 'Rapid', 'Silent', 'Shadow', 'Flash', 'Cyber', 'Nova',
    'Phantom', 'Vortex', 'Storm', 'Void', 'Apex', 'Chrome', 'Icon', 'Echo',
    'Bolt', 'Titan', 'Nexus', 'Blaze', 'Steel', 'Quantum', 'Sonic', 'Helix',
    'Rogue', 'Prism', 'Pulse', 'Volt', 'Neon', 'Surge', 'Scarlet', 'Inferno'
  ];

  static nouns = [
    'Falcon', 'Dragon', 'Phoenix', 'Viper', 'Hawk', 'Raven', 'Angel', 'Demon',
    'Specter', 'Panther', 'Tiger', 'Wolf', 'Bear', 'Eagle', 'Cobra', 'Reaper',
    'Hunter', 'Ninja', 'Cipher', 'Pathfinder', 'Scout', 'Ranger', 'Striker',
    'Wraith', 'Cipher', 'Shadow', 'Ghost', 'Blade', 'Fang', 'Talon', 'Assassin'
  ];

  static generate() {
    const adjective = this.adjectives[Math.floor(Math.random() * this.adjectives.length)];
    const noun = this.nouns[Math.floor(Math.random() * this.nouns.length)];
    const number = Math.floor(Math.random() * 999) + 1;
    return `${adjective}${noun}${number}`;
  }
}
