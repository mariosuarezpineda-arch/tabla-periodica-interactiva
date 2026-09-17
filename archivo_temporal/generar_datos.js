/**
 * Script ETL (Extract, Transform, Load) en Node.js.
 * Combina datos base en inglés con descripciones en español desde Wikipedia.
 */
const fs = require('fs');

const API_BASE_DATA = "https://raw.githubusercontent.com/Bowserinator/Periodic-Table-JSON/master/PeriodicTableJSON.json";

// Mapeo exacto de los 118 elementos en español, ordenados por número atómico (Z)
const nombresES = [
  "Hidrógeno", "Helio", "Litio", "Berilio", "Boro", "Carbono", "Nitrógeno", "Oxígeno", "Flúor", "Neón",
  "Sodio", "Magnesio", "Aluminio", "Silicio", "Fósforo", "Azufre", "Cloro", "Argón", "Potasio", "Calcio",
  "Escandio", "Titanio", "Vanadio", "Cromo", "Manganeso", "Hierro", "Cobalto", "Níquel", "Cobre", "Zinc",
  "Galio", "Germanio", "Arsénico", "Selenio", "Bromo", "Kriptón", "Rubidio", "Estroncio", "Itrio", "Circonio",
  "Niobio", "Molibdeno", "Tecnecio", "Rutenio", "Rodio", "Paladio", "Plata", "Cadmio", "Indio", "Estaño",
  "Antimonio", "Telurio", "Yodo", "Xenón", "Cesio", "Bario", "Lantano", "Cerio", "Praseodimio", "Neodimio",
  "Prometio", "Samario", "Europio", "Gadolinio", "Terbio", "Disprosio", "Holmio", "Erbio", "Tulio", "Iterbio",
  "Lutecio", "Hafnio", "Tantalio", "Wolframio", "Renio", "Osmio", "Iridio", "Platino", "Oro", "Mercurio",
  "Talio", "Plomo", "Bismuto", "Polonio", "Astato", "Radón", "Francio", "Radio", "Actinio", "Torio",
  "Protactinio", "Uranio", "Neptunio", "Plutonio", "Americio", "Curio", "Berkelio", "Californio", "Einstenio", "Fermio",
  "Mendelevio", "Nobelio", "Lawrencio", "Rutherfordio", "Dubnio", "Seaborgio", "Bohrio", "Hasio", "Meitnerio", "Darmstadtio",
  "Roentgenio", "Copernicio", "Nihonio", "Flerovio", "Moscovio", "Livermorio", "Teneso", "Oganesón"
];

const mapGrupo = (category) => {
    const mapa = {
        "alkali metal": "alcalinos",
        "alkaline earth metal": "alcalinoterreos",
        "transition metal": "transicion",
        "post-transition metal": "otros-metales",
        "metalloid": "metaloides",
        "diatomic nonmetal": "no-metales",
        "polyatomic nonmetal": "no-metales",
        "reactive nonmetal": "no-metales",
        "halogen": "halogenos",
        "noble gas": "gases-nobles",
        "lanthanide": "lantanidos",
        "actinide": "actinidos"
    };
    for (const key in mapa) {
        if (category.toLowerCase().includes(key)) return mapa[key];
    }
    return "otros-metales"; 
};

// Función definitiva usando la Action API de MediaWiki
async function obtenerResumenWikipedia(nombreElemento) {
    const intentarFetch = async (termino) => {
        // La Action API maneja redirecciones automáticas y extrae texto limpio
        const url = `https://es.wikipedia.org/w/api.php?action=query&prop=extracts&format=json&exintro=1&explaintext=1&redirects=1&titles=${encodeURIComponent(termino)}`;
        const response = await fetch(url);
        
        if (!response.ok) return null;

        const data = await response.json();
        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];

        // Si la página no existe, el ID devuelto es -1
        if (pageId === "-1") return null;

        const extracto = pages[pageId].extract;

        // Filtramos páginas de desambiguación o extractos vacíos
        if (!extracto || extracto.toLowerCase().includes("puede hacer referencia a") || extracto.toLowerCase().includes("desambiguación")) {
            return null;
        }

        // Devolvemos solo el primer párrafo para mantener la ficha UI limpia y estructurada
        return extracto.split('\n')[0];
    };

    try {
        // 1. Intento principal (Ej: "Plomo")
        let resumen = await intentarFetch(nombreElemento);
        
        // 2. Fallback estándar para química (Ej: "Radio (elemento)")
        if (!resumen) resumen = await intentarFetch(`${nombreElemento} (elemento)`);
        
        // 3. Fallback secundario para casos específicos (Ej: "Plata (metal)")
        if (!resumen) resumen = await intentarFetch(`${nombreElemento} (metal)`);

        return resumen || "Descripción no disponible en la base de conocimientos.";
    } catch (error) {
        console.error(`Error de red con el elemento ${nombreElemento}:`, error);
        return "Error al conectar con Wikipedia.";
    }
}

async function procesarDatos() {
    try {
        console.log("📥 1. Descargando datos físicos (JSON original)...");
        const response = await fetch(API_BASE_DATA);
        const data = await response.json();

        const elementosTransformados = [];

        console.log("⚙️ 2. Procesando elementos y consultando Wikipedia en español (esto tomará unos segundos)...");
        
        // Iteramos de forma secuencial con un for...of para no saturar la API de Wikipedia
        for (let i = 0; i < data.elements.length; i++) {
            const e = data.elements[i];
            const nombreES = nombresES[i]; // Z - 1
            
            // Log para feedback visual en consola
            process.stdout.write(`\rProcesando: Z=${e.number} - ${nombreES}     `);

            const descripcionES = await obtenerResumenWikipedia(nombreES);

            elementosTransformados.push({
                z: e.number,
                s: e.symbol,
                n: nombreES,
                m: e.atomic_mass.toFixed(4),
                val: "", 
                f: e.period,
                c: e.group,
                g: mapGrupo(e.category),
                desc: descripcionES, // Descripción nativa en español
                densidad: e.density !== null ? e.density : "",
                electrones: e.shells
            });
            
            // Pausa de 50ms para ser "buenos ciudadanos" con la API pública
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        console.log("\n💾 3. Guardando archivo final...");
        fs.writeFileSync("elementos_espanol.json", JSON.stringify(elementosTransformados, null, 2));
        
        console.log("✅ ¡Proceso completado! Copia el contenido de 'elementos_espanol.json'.");
    } catch (error) {
        console.error("\n❌ Error crítico:", error);
    }
}

procesarDatos();