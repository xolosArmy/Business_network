document.addEventListener('DOMContentLoaded', () => {
  const langToggle = document.getElementById('lang-toggle');
  const rootHtml = document.documentElement;
  let currentLang = localStorage.getItem('preferred-lang') === 'en' ? 'en' : 'es';

  const translations = {
    es: {
      'nav-legend': 'Leyenda',
      'nav-gospel': 'Evangelio RMZ del Xoloitzcuintle',
      'nav-whitepaper': 'Nuestro Whitepaper',
      'nav-xolos': 'Xolos Ramírez',
      'nav-vision': 'Nuestra Visión',
      'nav-blog': 'Blog',
      'hero-badge': '<i class="fas fa-paw"></i> Energía ancestral del Xoloitzcuintle',
      'hero-title': 'XolosArmy Network',
      'hero-subtitle': 'Guardians of Culture, Blockchain, and Spirit. <br> Siente la vibración dorada de la manada XolosArmy: arte, historia y futuro unidos en la blockchain.',
      'hero-btn-nft': '🔥 Mint NFT Cigars',
      'hero-btn-rmz': '💰 Obtén $RMZ Ahora',
      'rmzwallet-badge': '🚀 Ya Disponible',
      'rmzwallet-title': 'RMZWallet v1.0',
      'rmzwallet-desc': 'La primera versión oficial de la billetera no custodial de XolosArmy ha sido lanzada. Gestiona tus tokens $RMZ y XEC directamente desde el navegador, con cifrado local y sin intermediarios.',
      'rmzwallet-feature-1': '🔐 Custodia local de claves y semilla cifrada.',
      'rmzwallet-feature-2': '⚡ Envío rápido de tokens $RMZ.',
      'rmzwallet-feature-3': '📊 Modo Solo Lectura disponible.',
      'rmzwallet-feature-4': '🧠 Compatible con red eCash (XEC).',
      'rmzwallet-cta': 'Ir a RMZWallet',
      'rmz-token-title': 'Xolos $RMZ: El Token del Xoloitzcuintle en la Blockchain',
      'rmz-token-desc': 'Xolos $RMZ es el corazón digital de XolosArmy Network: un token descentralizado que honra al Xoloitzcuintle y abre las puertas a una comunidad global.',
      'rmz-token-extra': 'Con Xolos $RMZ accedes a contenido exclusivo, NFTs legendarios, y participación en una red viva que fusiona cultura ancestral, tecnología y comunidad.',
      'rmz-token-cta': 'Obtén Xolos $RMZ Ahora',
      'video-title': 'Prueba xolosArmy Naturals, Visita nuestra tienda online de productos xoloitzcuintle',
      'gospel-title': 'El Evangelio RMZ del Xoloitzcuintle: Guardianes Eternos',
      'gospel-desc-1': 'Sumérgete en el Evangelio del Xoloitzcuintli RMZ, un manifiesto cultural que celebra al Xoloitzcuintle como guardián ancestral de los mundos visibles e invisibles.',
      'gospel-desc-2': 'Este documento único fusiona espiritualidad, historia y tecnología en un canto a la raza más antigua de América, ahora inmortalizada en la blockchain a través del token Xolos $RMZ.',
      'gospel-cta': 'Lee el PDF del Evangelio RMZ',
      'xolos-title': 'Conoce a Xolos Ramírez',
      'xolos-desc': 'Visita <a href="https://www.xolosramirez.com" target="_blank" style="color:var(--accent-amber-400); text-decoration:none;">xolosramirez.com</a> y descubre más.',
      'vision-title': 'Nuestra visión para el Network State XolosArmy',
      'vision-desc': 'Compartimos la visión, los objetivos y los planes futuros de la Red XolosArmy.',
      'vision-card-title': 'Aspectos Clave',
      'vision-point-1': 'Nuestra misión de construir una Red XolosArmy impulsada por la comunidad.',
      'vision-point-2': 'Planes para NFTs, participación comunitaria y desarrollos futuros.',
      'vision-point-3': 'Oportunidades para que los seguidores se involucren y contribuyan.',
      'blog-heading': 'Última entrada del Blog',
      'blog-title': '¡El Templo Digital ha abierto sus puertas! Lanzamiento oficial de la RMZWallet v1.0',
      'blog-desc': 'Anunciamos el despliegue oficial de RMZWallet, nuestra propia billetera self-custodial diseñada específicamente para navegar el ecosistema de xolosArmy Network sobre la red eCash (XEC).',
      'blog-cta': 'Leer más',
      'whitepaper-title': 'Whitepaper Oficial de Xolos $RMZ',
      'whitepaper-subtitle-1': 'Token de Cultura, Comunidad e Infraestructura',
      'whitepaper-subtitle-2': 'Resumen Ejecutivo',
      'whitepaper-summary': '💡 Resumen Ejecutivo',
      'roadmap-eyebrow': '🔒 Roadmap',
      'roadmap-title': 'RMZWallet / Tonalli Roadmap',
      'roadmap-desc': 'La billetera de XolosArmy evoluciona de un simple monedero no custodial a un hub completo para <strong>XEC, $RMZ y NFTs de XolosArmy</strong>. Cada etapa está pensada para que los guardianes del Xoloitzcuintle puedan adoptar, intercambiar y coleccionar dentro del ecosistema eCash.',
      'roadmap-item-1': '<span>✅</span> Lanzamiento de <strong>RMZWallet v1.0</strong>: envío y recepción de XEC y $RMZ, PWA con modo sin conexión y custodia local de claves.',
      'roadmap-item-2': '<span>💱</span> Integración de <strong>Atomic Swap DEX XEC ⇄ $RMZ</strong> directamente en la billetera (sin salir a otras interfaces).',
      'roadmap-item-3': '<span>💡</span> <strong>Campaña Flipstarter</strong>: recaudación de fondos para las próximas mejoras del RMZWallet.',
      'roadmap-item-4': '<span>🖼️</span> Soporte nativo para <strong>almacenar y visualizar NFTs de XolosArmy</strong> (galería integrada para colecciones culturales del Xoloitzcuintle).',
      'roadmap-item-5': '<span>🧠</span> Módulo de <strong>pagos con eToken para adopciones</strong>: flujo simplificado para reservar y adoptar xoloitzcuintles usando $RMZ.',
      'roadmap-item-6': '<span>🚀</span> Evolución a <strong>Tonalli Wallet</strong>: mejoras de UX, multi-idioma (ES/EN) y herramientas avanzadas para la comunidad XolosArmy.',
      'roadmap-note': 'Este roadmap es vivo: se ajusta junto con la manada y las necesidades reales de quienes usan el Xoloitzcuintle como puente entre cultura y blockchain.'
    },
    en: {
      'nav-legend': 'Legend',
      'nav-gospel': 'RMZ Gospel of the Xoloitzcuintle',
      'nav-whitepaper': 'Our Whitepaper',
      'nav-xolos': 'Xolos Ramírez',
      'nav-vision': 'Our Vision',
      'nav-blog': 'Blog',
      'hero-badge': '<i class="fas fa-paw"></i> Ancestral energy of the Xoloitzcuintle',
      'hero-title': 'XolosArmy Network',
      'hero-subtitle': 'Guardians of Culture, Blockchain, and Spirit. <br> Feel the golden vibration of the XolosArmy pack: art, history, and future united on the blockchain.',
      'hero-btn-nft': '🔥 Mint NFT Cigars',
      'hero-btn-rmz': '💰 Get $RMZ Now',
      'rmzwallet-badge': '🚀 Now Available',
      'rmzwallet-title': 'RMZWallet v1.0',
      'rmzwallet-desc': 'The first official non-custodial wallet from XolosArmy has launched. Manage your $RMZ and XEC tokens right from your browser with local encryption and no intermediaries.',
      'rmzwallet-feature-1': '🔐 Local key custody and encrypted seed.',
      'rmzwallet-feature-2': '⚡ Fast $RMZ token transfers.',
      'rmzwallet-feature-3': '📊 Read-Only mode available.',
      'rmzwallet-feature-4': '🧠 Compatible with the eCash (XEC) network.',
      'rmzwallet-cta': 'Go to RMZWallet',
      'rmz-token-title': 'Xolos $RMZ: The Xoloitzcuintle Token on the Blockchain',
      'rmz-token-desc': 'Xolos $RMZ is the digital heart of XolosArmy Network: a decentralized token that honors the Xoloitzcuintle and opens the doors to a global community.',
      'rmz-token-extra': 'With Xolos $RMZ you gain access to exclusive content, legendary NFTs, and participation in a living network that fuses ancestral culture, technology, and community.',
      'rmz-token-cta': 'Get Xolos $RMZ Now',
      'video-title': 'Try XolosArmy Naturals, visit our online shop for Xoloitzcuintle products',
      'gospel-title': 'The RMZ Gospel of the Xoloitzcuintle: Eternal Guardians',
      'gospel-desc-1': 'Dive into the RMZ Gospel of the Xoloitzcuintle, a cultural manifesto celebrating the Xoloitzcuintle as an ancestral guardian of the visible and invisible worlds.',
      'gospel-desc-2': 'This unique document blends spirituality, history, and technology to honor the oldest breed in the Americas—now immortalized on the blockchain through the Xolos $RMZ token.',
      'gospel-cta': 'Read the RMZ Gospel PDF',
      'xolos-title': 'Meet Xolos Ramírez',
      'xolos-desc': 'Visit <a href="https://www.xolosramirez.com" target="_blank" style="color:var(--accent-amber-400); text-decoration:none;">xolosramirez.com</a> and discover more.',
      'vision-title': 'Our Vision for the XolosArmy Network State',
      'vision-desc': 'We share the vision, goals, and future plans for the XolosArmy Network.',
      'vision-card-title': 'Key Points',
      'vision-point-1': 'Our mission to build a community-driven XolosArmy Network.',
      'vision-point-2': 'Plans for NFTs, community participation, and future development.',
      'vision-point-3': 'Opportunities for supporters to get involved and contribute.',
      'blog-heading': 'Latest Blog Post',
      'blog-title': 'The Digital Temple is open! Official launch of RMZWallet v1.0',
      'blog-desc': 'We announce the official rollout of RMZWallet, our self-custodial wallet designed specifically to navigate the XolosArmy Network ecosystem on the eCash (XEC) network.',
      'blog-cta': 'Read more',
      'whitepaper-title': 'Official Whitepaper of Xolos $RMZ',
      'whitepaper-subtitle-1': 'Token of Culture, Community, and Infrastructure',
      'whitepaper-subtitle-2': 'Executive Summary',
      'whitepaper-summary': '💡 Executive Summary',
      'roadmap-eyebrow': '🔒 Roadmap',
      'roadmap-title': 'RMZWallet / Tonalli Roadmap',
      'roadmap-desc': 'The XolosArmy wallet evolves from a simple non-custodial wallet into a full hub for <strong>XEC, $RMZ, and XolosArmy NFTs</strong>. Each stage is designed so Xoloitzcuintle guardians can adopt, exchange, and collect within the eCash ecosystem.',
      'roadmap-item-1': '<span>✅</span> Launch of <strong>RMZWallet v1.0</strong>: send and receive XEC and $RMZ, PWA with offline mode, and local key custody.',
      'roadmap-item-2': '<span>💱</span> Integration of <strong>Atomic Swap DEX XEC ⇄ $RMZ</strong> directly in the wallet (no need to leave the interface).',
      'roadmap-item-3': '<span>💡</span> <strong>Flipstarter Campaign</strong>: fundraising for upcoming RMZWallet improvements.',
      'roadmap-item-4': '<span>🖼️</span> Native support to <strong>store and view XolosArmy NFTs</strong> (integrated gallery for Xoloitzcuintle cultural collections).',
      'roadmap-item-5': '<span>🧠</span> <strong>eToken payments module for adoptions</strong>: simplified flow to reserve and adopt Xoloitzcuintles using $RMZ.',
      'roadmap-item-6': '<span>🚀</span> Evolution to <strong>Tonalli Wallet</strong>: UX upgrades, multi-language (ES/EN), and advanced tools for the XolosArmy community.',
      'roadmap-note': 'This roadmap is alive: it evolves with the pack and the real needs of those who use the Xoloitzcuintle as a bridge between culture and blockchain.'
    }
  };

  const updateLangToggleLabel = (lang) => {
    if (!langToggle) return;
    const nextLang = lang === 'es' ? 'en' : 'es';
    langToggle.textContent = nextLang.toUpperCase();
    langToggle.setAttribute(
      'aria-label',
      nextLang === 'en' ? 'Cambiar idioma a inglés' : 'Switch language to Spanish'
    );
  };

  const applyTranslations = (lang) => {
    const entries = translations[lang];
    if (!entries) return;
    Object.entries(entries).forEach(([id, text]) => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = text;
      }
    });
    rootHtml.setAttribute('lang', lang);
    updateLangToggleLabel(lang);
  };

  const setLanguage = (lang) => {
    currentLang = lang;
    localStorage.setItem('preferred-lang', lang);
    applyTranslations(lang);
  };

  if (langToggle) {
    applyTranslations(currentLang);
    langToggle.addEventListener('click', () => {
      const nextLang = currentLang === 'es' ? 'en' : 'es';
      setLanguage(nextLang);
    });
  }
});

setTimeout(function() {
  const popup = document.getElementById('popup-xolo');
  if (popup) {
    popup.style.display = 'block';
  }
}, 8000);
