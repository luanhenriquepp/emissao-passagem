/**
 * Dataset compacto de aeroportos para autocomplete (front) e expansão de
 * grupos de cidade (API). O produto real embute ~1.530 aeroportos; aqui vão os
 * mais usados por agências brasileiras. Substitua por uma fonte completa
 * (OpenFlights/OurAirports) quando precisar.
 */

export interface Airport {
  iata: string;
  city: string;
  name: string;
  /** UF para o Brasil, país para o exterior */
  region: string;
  country: string; // ISO-2
}

export interface CityGroup {
  code: string;
  city: string;
  region: string;
  country: string;
  airports: string[];
}

export const AIRPORTS: Airport[] = [
  // Brasil
  { iata: 'GRU', city: 'São Paulo', name: 'Guarulhos', region: 'SP', country: 'BR' },
  { iata: 'CGH', city: 'São Paulo', name: 'Congonhas', region: 'SP', country: 'BR' },
  { iata: 'VCP', city: 'Campinas', name: 'Viracopos', region: 'SP', country: 'BR' },
  { iata: 'GIG', city: 'Rio de Janeiro', name: 'Galeão', region: 'RJ', country: 'BR' },
  { iata: 'SDU', city: 'Rio de Janeiro', name: 'Santos Dumont', region: 'RJ', country: 'BR' },
  { iata: 'BSB', city: 'Brasília', name: 'Pres. Juscelino Kubitschek', region: 'DF', country: 'BR' },
  { iata: 'CNF', city: 'Belo Horizonte', name: 'Confins', region: 'MG', country: 'BR' },
  { iata: 'PLU', city: 'Belo Horizonte', name: 'Pampulha', region: 'MG', country: 'BR' },
  { iata: 'POA', city: 'Porto Alegre', name: 'Salgado Filho', region: 'RS', country: 'BR' },
  { iata: 'CWB', city: 'Curitiba', name: 'Afonso Pena', region: 'PR', country: 'BR' },
  { iata: 'FLN', city: 'Florianópolis', name: 'Hercílio Luz', region: 'SC', country: 'BR' },
  { iata: 'NVT', city: 'Navegantes', name: 'Min. Victor Konder', region: 'SC', country: 'BR' },
  { iata: 'REC', city: 'Recife', name: 'Guararapes', region: 'PE', country: 'BR' },
  { iata: 'SSA', city: 'Salvador', name: 'Dep. Luís Eduardo Magalhães', region: 'BA', country: 'BR' },
  { iata: 'FOR', city: 'Fortaleza', name: 'Pinto Martins', region: 'CE', country: 'BR' },
  { iata: 'NAT', city: 'Natal', name: 'Gov. Aluízio Alves', region: 'RN', country: 'BR' },
  { iata: 'MCZ', city: 'Maceió', name: 'Zumbi dos Palmares', region: 'AL', country: 'BR' },
  { iata: 'JPA', city: 'João Pessoa', name: 'Pres. Castro Pinto', region: 'PB', country: 'BR' },
  { iata: 'AJU', city: 'Aracaju', name: 'Santa Maria', region: 'SE', country: 'BR' },
  { iata: 'SLZ', city: 'São Luís', name: 'Mal. Cunha Machado', region: 'MA', country: 'BR' },
  { iata: 'THE', city: 'Teresina', name: 'Sen. Petrônio Portella', region: 'PI', country: 'BR' },
  { iata: 'BEL', city: 'Belém', name: 'Val de Cans', region: 'PA', country: 'BR' },
  { iata: 'MAO', city: 'Manaus', name: 'Eduardo Gomes', region: 'AM', country: 'BR' },
  { iata: 'CGB', city: 'Cuiabá', name: 'Mal. Rondon', region: 'MT', country: 'BR' },
  { iata: 'CGR', city: 'Campo Grande', name: 'Campo Grande', region: 'MS', country: 'BR' },
  { iata: 'GYN', city: 'Goiânia', name: 'Santa Genoveva', region: 'GO', country: 'BR' },
  { iata: 'VIX', city: 'Vitória', name: 'Eurico de Aguiar Salles', region: 'ES', country: 'BR' },
  { iata: 'IGU', city: 'Foz do Iguaçu', name: 'Cataratas', region: 'PR', country: 'BR' },
  { iata: 'PMW', city: 'Palmas', name: 'Brig. Lysias Rodrigues', region: 'TO', country: 'BR' },
  { iata: 'UDI', city: 'Uberlândia', name: 'Ten. Cel. César Bombonato', region: 'MG', country: 'BR' },
  { iata: 'RAO', city: 'Ribeirão Preto', name: 'Leite Lopes', region: 'SP', country: 'BR' },
  { iata: 'BPS', city: 'Porto Seguro', name: 'Porto Seguro', region: 'BA', country: 'BR' },
  { iata: 'IOS', city: 'Ilhéus', name: 'Jorge Amado', region: 'BA', country: 'BR' },
  { iata: 'FEN', city: 'Fernando de Noronha', name: 'Fernando de Noronha', region: 'PE', country: 'BR' },
  { iata: 'JDO', city: 'Juazeiro do Norte', name: 'Orlando Bezerra', region: 'CE', country: 'BR' },
  // América do Sul
  { iata: 'EZE', city: 'Buenos Aires', name: 'Ezeiza', region: 'Argentina', country: 'AR' },
  { iata: 'AEP', city: 'Buenos Aires', name: 'Aeroparque', region: 'Argentina', country: 'AR' },
  { iata: 'SCL', city: 'Santiago', name: 'Arturo Merino Benítez', region: 'Chile', country: 'CL' },
  { iata: 'MVD', city: 'Montevidéu', name: 'Carrasco', region: 'Uruguai', country: 'UY' },
  { iata: 'LIM', city: 'Lima', name: 'Jorge Chávez', region: 'Peru', country: 'PE' },
  { iata: 'BOG', city: 'Bogotá', name: 'El Dorado', region: 'Colômbia', country: 'CO' },
  { iata: 'ASU', city: 'Assunção', name: 'Silvio Pettirossi', region: 'Paraguai', country: 'PY' },
  // América do Norte
  { iata: 'MIA', city: 'Miami', name: 'Miami International', region: 'EUA', country: 'US' },
  { iata: 'MCO', city: 'Orlando', name: 'Orlando International', region: 'EUA', country: 'US' },
  { iata: 'JFK', city: 'Nova York', name: 'John F. Kennedy', region: 'EUA', country: 'US' },
  { iata: 'EWR', city: 'Nova York', name: 'Newark', region: 'EUA', country: 'US' },
  { iata: 'LGA', city: 'Nova York', name: 'LaGuardia', region: 'EUA', country: 'US' },
  { iata: 'LAX', city: 'Los Angeles', name: 'Los Angeles International', region: 'EUA', country: 'US' },
  { iata: 'ATL', city: 'Atlanta', name: 'Hartsfield-Jackson', region: 'EUA', country: 'US' },
  { iata: 'DFW', city: 'Dallas', name: 'Dallas/Fort Worth', region: 'EUA', country: 'US' },
  { iata: 'YYZ', city: 'Toronto', name: 'Pearson', region: 'Canadá', country: 'CA' },
  { iata: 'MEX', city: 'Cidade do México', name: 'Benito Juárez', region: 'México', country: 'MX' },
  { iata: 'CUN', city: 'Cancún', name: 'Cancún International', region: 'México', country: 'MX' },
  { iata: 'PTY', city: 'Cidade do Panamá', name: 'Tocumen', region: 'Panamá', country: 'PA' },
  // Europa
  { iata: 'LIS', city: 'Lisboa', name: 'Humberto Delgado', region: 'Portugal', country: 'PT' },
  { iata: 'OPO', city: 'Porto', name: 'Francisco Sá Carneiro', region: 'Portugal', country: 'PT' },
  { iata: 'MAD', city: 'Madri', name: 'Barajas', region: 'Espanha', country: 'ES' },
  { iata: 'BCN', city: 'Barcelona', name: 'El Prat', region: 'Espanha', country: 'ES' },
  { iata: 'CDG', city: 'Paris', name: 'Charles de Gaulle', region: 'França', country: 'FR' },
  { iata: 'ORY', city: 'Paris', name: 'Orly', region: 'França', country: 'FR' },
  { iata: 'LHR', city: 'Londres', name: 'Heathrow', region: 'Reino Unido', country: 'GB' },
  { iata: 'LGW', city: 'Londres', name: 'Gatwick', region: 'Reino Unido', country: 'GB' },
  { iata: 'AMS', city: 'Amsterdã', name: 'Schiphol', region: 'Holanda', country: 'NL' },
  { iata: 'FRA', city: 'Frankfurt', name: 'Frankfurt', region: 'Alemanha', country: 'DE' },
  { iata: 'MUC', city: 'Munique', name: 'Franz Josef Strauss', region: 'Alemanha', country: 'DE' },
  { iata: 'FCO', city: 'Roma', name: 'Fiumicino', region: 'Itália', country: 'IT' },
  { iata: 'MXP', city: 'Milão', name: 'Malpensa', region: 'Itália', country: 'IT' },
  { iata: 'ZRH', city: 'Zurique', name: 'Zurique', region: 'Suíça', country: 'CH' },
  { iata: 'IST', city: 'Istambul', name: 'Istanbul Airport', region: 'Turquia', country: 'TR' },
  // Oriente Médio / África / Ásia
  { iata: 'DXB', city: 'Dubai', name: 'Dubai International', region: 'Emirados', country: 'AE' },
  { iata: 'DOH', city: 'Doha', name: 'Hamad', region: 'Catar', country: 'QA' },
  { iata: 'JNB', city: 'Joanesburgo', name: 'O. R. Tambo', region: 'África do Sul', country: 'ZA' },
  { iata: 'NRT', city: 'Tóquio', name: 'Narita', region: 'Japão', country: 'JP' },
];

export const CITY_GROUPS: CityGroup[] = [
  { code: 'SAO', city: 'São Paulo', region: 'SP', country: 'BR', airports: ['GRU', 'CGH', 'VCP'] },
  { code: 'RIO', city: 'Rio de Janeiro', region: 'RJ', country: 'BR', airports: ['GIG', 'SDU'] },
  { code: 'BHZ', city: 'Belo Horizonte', region: 'MG', country: 'BR', airports: ['CNF', 'PLU'] },
  { code: 'BUE', city: 'Buenos Aires', region: 'Argentina', country: 'AR', airports: ['EZE', 'AEP'] },
  { code: 'NYC', city: 'Nova York', region: 'EUA', country: 'US', airports: ['JFK', 'EWR', 'LGA'] },
  { code: 'LON', city: 'Londres', region: 'Reino Unido', country: 'GB', airports: ['LHR', 'LGW'] },
  { code: 'PAR', city: 'Paris', region: 'França', country: 'FR', airports: ['CDG', 'ORY'] },
];

/** Grupos sugeridos quando o campo abre vazio. */
export const POPULAR_CODES = ['SAO', 'RIO', 'BSB', 'NYC', 'LON', 'PAR', 'LIS', 'MIA'];

const airportIndex = new Map(AIRPORTS.map((a) => [a.iata, a]));
const groupIndex = new Map(CITY_GROUPS.map((g) => [g.code, g]));

export function findAirport(iata: string): Airport | undefined {
  return airportIndex.get(iata.toUpperCase());
}

export function findCityGroup(code: string): CityGroup | undefined {
  return groupIndex.get(code.toUpperCase());
}

/** Expande um IATA ou grupo de cidade para a lista de aeroportos reais. */
export function expandLocation(code: string): string[] {
  const group = findCityGroup(code);
  if (group) return group.airports;
  return findAirport(code) ? [code.toUpperCase()] : [];
}

export function isKnownLocation(code: string): boolean {
  return expandLocation(code).length > 0;
}

export function countryOf(code: string): string | undefined {
  return findCityGroup(code)?.country ?? findAirport(code)?.country;
}

/** Nome exibível de um código (aeroporto ou grupo). */
export function locationLabel(code: string): { city: string; detail: string } {
  const g = findCityGroup(code);
  if (g) return { city: g.city, detail: 'Todos os aeroportos' };
  const a = findAirport(code);
  if (a) return { city: a.city, detail: a.name };
  return { city: code, detail: '' };
}

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export interface LocationSuggestion {
  code: string;
  city: string;
  detail: string;
  kind: 'group' | 'airport';
}

/** Autocomplete por prefixo de cidade, nome ou IATA; grupos aparecem antes dos aeroportos da mesma cidade. */
export function suggestLocations(query: string, limit = 8): LocationSuggestion[] {
  const q = fold(query.trim());
  const out: LocationSuggestion[] = [];
  if (!q) {
    for (const code of POPULAR_CODES) {
      const l = locationLabel(code);
      out.push({ code, city: l.city, detail: l.detail, kind: findCityGroup(code) ? 'group' : 'airport' });
    }
    return out.slice(0, limit);
  }
  const matchesText = (text: string) => fold(text).split(/\s+/).some((w) => w.startsWith(q)) || fold(text).startsWith(q);
  for (const g of CITY_GROUPS) {
    if (fold(g.code) === q || matchesText(g.city)) {
      out.push({ code: g.code, city: g.city, detail: `Todos os aeroportos · ${g.region}`, kind: 'group' });
    }
  }
  for (const a of AIRPORTS) {
    if (fold(a.iata) === q || matchesText(a.city) || matchesText(a.name)) {
      out.push({ code: a.iata, city: a.city, detail: `${a.name} · ${a.region}`, kind: 'airport' });
    }
  }
  return out.slice(0, limit);
}
