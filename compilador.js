const fs = require('fs');
const path = require('path');

const NOMES_MESES = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

// Helper nativo para realizar requisicoes HTTP/HTTPS com Promises (sem dependencias)
function httpRequest(options, postData = null, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject(new Error("Limite de redirecionamentos excedido"));
    }

    const httpLib = (options.url && options.url.startsWith('https')) ? require('https') : require('http');
    const targetUrl = options.url || null;
    
    let reqOptions = { ...options };
    if (targetUrl) {
      const parsedUrl = new URL(targetUrl);
      reqOptions.hostname = parsedUrl.hostname;
      reqOptions.path = parsedUrl.pathname + parsedUrl.search;
      reqOptions.port = parsedUrl.port;
      reqOptions.protocol = parsedUrl.protocol;
    }

    const req = httpLib.request(reqOptions, (res) => {
      // Trata redirecionamentos automáticos
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          const origin = `${reqOptions.protocol || 'https:'}//${reqOptions.hostname}`;
          redirectUrl = new URL(redirectUrl, origin).href;
        }
        const newOptions = { ...options, url: redirectUrl };
        if (res.statusCode === 303) {
          newOptions.method = 'GET';
        }
        return httpRequest(newOptions, postData, redirectCount + 1)
          .then(resolve)
          .catch(reject);
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', (err) => { reject(err); });

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

// Configurações e Feeds RSS de Notícias de Universidades da Bahia
const FEEDS_MONITORADOS = [
  { sigla: 'UFBA', url: 'https://www.ufba.br/rss.xml' },
  { sigla: 'UNEB', url: 'https://portal.uneb.br/feed/' },
  { sigla: 'UFRB', url: 'https://ufrb.edu.br/portal/noticias?format=feed&type=rss' },
  { sigla: 'IFBA', url: 'https://portal.ifba.edu.br/noticias/@@rss' }
];

// Palavras-chave para identificar pós-graduações e editais de interesse
const TERMOS_EDITAL = [
  'edital', 'seleção', 'selecao', 'inscrições', 'inscricoes', 'processo seletivo', 
  'mestrado', 'doutorado', 'pós-graduação', 'pos-graduacao', 'aluno especial', 
  'aluno de matrícula especial', 'aluno de matricula especial', 'matrícula especial', 
  'matricula especial', 'estudante especial', 'aluno regular', 'disciplina isolada', 
  'disciplinas isoladas', 'vagas abertas', 'admissão', 'admissao'
];

// Mapeamento de temas de interesse e seus termos associados
// Mapeamento de temas de interesse e seus termos associados (todas as áreas de conhecimento)
const TEMAS_INTERESSE = {
  'Educação': ['educação', 'educacao', 'pedagogia', 'ensino', 'didática', 'didatica', 'escola', 'currículo', 'curriculo', 'aprendizagem', 'professor', 'docente', 'licenciatura'],
  'Tecnologia e Informática': ['computação', 'computacao', 'informática', 'informatica', 'tecnologia da informação', 'tecnologia da informacao', 'ti', 'sistemas de informação', 'sistemas de informacao', 'ciência de dados', 'ciencia de dados', 'algoritmos', 'software', 'banco de dados', 'inteligência artificial', 'programação'],
  'Gestão e Negócios': ['administração', 'administracao', 'gestão', 'gestao', 'negócios', 'negocios', 'economia', 'finanças', 'financas', 'marketing', 'controladoria', 'empreendedorismo', 'recursos humanos', 'logística'],
  'Saúde e Biológicas': ['saúde', 'saude', 'medicina', 'enfermagem', 'nutrição', 'nutricao', 'odontologia', 'biologia', 'farmácia', 'farmacia', 'fisioterapia', 'psicologia', 'epidemiologia', 'saúde coletiva', 'saude coletiva'],
  'Humanas e Sociais': ['sociologia', 'filosofia', 'história', 'historia', 'direito', 'geografia', 'antropologia', 'ciência política', 'ciencia politica', 'serviço social', 'servico social', 'letras', 'linguística', 'linguistica'],
  'Comunicação e Artes': ['comunicação', 'comunicacao', 'jornalismo', 'mídia', 'midia', 'artes', 'música', 'musica', 'cinema', 'audiovisual', 'publicidade', 'propaganda', 'design'],
  'Engenharias e Exatas': ['engenharia', 'física', 'fisica', 'matemática', 'matematica', 'química', 'quimica', 'estatística', 'estatistica', 'arquitetura', 'urbanismo'],
  'Agrárias e Ambientais': ['agronomia', 'veterinária', 'veterinaria', 'zootecnia', 'meio ambiente', 'ambiental', 'ecologia', 'recursos naturais', 'irrigação', 'irrigaçao', 'sustentabilidade', 'agroecologia']
};

// Detalhes das Pós-Graduações Reais das Instituições Baianas para o Gerador/Fallbacks
const PROGRAMAS_REAIS = [
  // UFBA
  {
    instituicao: 'UFBA',
    campus: 'Salvador - Campus Ondina',
    nomeProg: 'Programa de Pós-Graduação em Educação (PPGE)',
    eixo: 'Educação',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Focado em políticas educacionais, formação de professores, diversidade e gestão da educação.'
  },
  {
    instituicao: 'UFBA',
    campus: 'Salvador - Campus Ondina',
    nomeProg: 'Programa de Pós-Graduação em Ciência da Computação (PGCOMP)',
    eixo: 'Tecnologia e Informática',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Referência em engenharia de software, sistemas distribuídos, inteligência artificial e computação aplicada.'
  },
  {
    instituicao: 'UFBA',
    campus: 'Salvador - Campus Ondina',
    nomeProg: 'Pós-Graduação em Comunicação e Cultura Contemporâneas (PósCom)',
    eixo: 'Comunicação e Artes',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Estudos em cibercultura, mídias digitais, jornalismo contemporâneo e economia política da comunicação.'
  },
  {
    instituicao: 'UFBA',
    campus: 'Salvador - Campus Canela',
    nomeProg: 'Programa de Pós-Graduação em Saúde Coletiva (PPGSC)',
    eixo: 'Saúde e Biológicas',
    mestradoAcad: true, mestradoProf: true, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Estudos epidemiológicos, políticas de saúde, ciências sociais em saúde e planejamento de serviços de saúde.'
  },
  {
    instituicao: 'UFBA',
    campus: 'Salvador - Campus Canela',
    nomeProg: 'Programa de Pós-Graduação em Administração (NPGA)',
    eixo: 'Gestão e Negócios',
    mestradoAcad: true, mestradoProf: true, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Pesquisas em organizações, finanças corporativas, estratégia, marketing e gestão pública.'
  },
  {
    instituicao: 'UFBA',
    campus: 'Salvador - Campus Federação',
    nomeProg: 'Programa de Pós-Graduação em Engenharia Industrial (PEI)',
    eixo: 'Engenharias e Exatas',
    mestradoAcad: true, mestradoProf: true, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Otimização de processos, engenharia de segurança, inteligência industrial e eficiência energética.'
  },

  // UNEB
  {
    instituicao: 'UNEB',
    campus: 'Salvador - Campus I',
    nomeProg: 'Mestrado Profissional em Educação de Jovens e Adultos (MPEJA)',
    eixo: 'Educação',
    mestradoAcad: false, mestradoProf: true, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Focado em políticas de inclusão, metodologias ativas e materiais didáticos para EJA.'
  },
  {
    instituicao: 'UNEB',
    campus: 'Salvador - Campus I',
    nomeProg: 'Programa de Pós-Graduação em Gestão e Tecnologias Aplicadas à Educação (GESTEC)',
    eixo: 'Gestão e Negócios',
    mestradoAcad: false, mestradoProf: true, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Estudos de gestão educacional, produção de materiais multimídia e tecnologias aplicadas ao ensino.'
  },
  {
    instituicao: 'UNEB',
    campus: 'Salvador - Campus I',
    nomeProg: 'Programa de Pós-Graduação em Estudos Linguísticos (PPGEL)',
    eixo: 'Humanas e Sociais',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Pesquisas em análise do discurso, linguística aplicada, variação linguística e sociolinguística.'
  },
  {
    instituicao: 'UNEB',
    campus: 'Salvador - Campus I',
    nomeProg: 'Programa de Pós-Graduação em Educação e Contemporaneidade (PPGEduC)',
    eixo: 'Educação',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Estudos avançados em educação e contemporaneidade, políticas públicas educacionais e movimentos sociais.'
  },

  // UFRB
  {
    instituicao: 'UFRB',
    campus: 'Amargosa - Centro de Formação de Professores',
    nomeProg: 'Programa de Pós-Graduação em Educação do Campo (PPGEC)',
    eixo: 'Educação',
    mestradoAcad: false, mestradoProf: true, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Voltado para a realidade das escolas do campo, movimentos sociais e práticas pedagógicas interdisciplinares.'
  },
  {
    instituicao: 'UFRB',
    campus: 'Cruz das Almas - Campus Universitário',
    nomeProg: 'Programa de Pós-Graduação em Engenharia Agrícola (PPGEA)',
    eixo: 'Agrárias e Ambientais',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Foco em engenharia de água e solo, mecanização agrícola, processamento de produtos agrícolas e irrigação.'
  },
  {
    instituicao: 'UFRB',
    campus: 'Cruz das Almas - Campus Universitário',
    nomeProg: 'Mestrado em Comunicação e Interculturalidade',
    eixo: 'Comunicação e Artes',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Estudos sobre manifestações populares, comunicação regional, fluxos identitários e interculturalidade.'
  },

  // IFBA
  {
    instituicao: 'IFBA',
    campus: 'Salvador - Geral',
    nomeProg: 'Mestrado Profissional em Educação Profissional e Tecnológica (ProfEPT)',
    eixo: 'Educação',
    mestradoAcad: false, mestradoProf: true, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Formação na área de educação profissional e tecnológica integrando práticas pedagógicas e pesquisa aplicada.'
  },
  {
    instituicao: 'IFBA',
    campus: 'Salvador - Campus Salvador',
    nomeProg: 'Mestrado Profissional em Engenharia de Sistemas e Produtos (PPGESP)',
    eixo: 'Engenharias e Exatas',
    mestradoAcad: false, mestradoProf: true, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Desenvolvimento de tecnologias em sistemas embarcados, engenharia de software e controle de produtos.'
  },
  {
    instituicao: 'IFBA',
    campus: 'Salvador - Campus Salvador',
    nomeProg: 'Mestrado Profissional em Engenharia de Materiais (PPGEM)',
    eixo: 'Engenharias e Exatas',
    mestradoAcad: false, mestradoProf: true, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Pesquisa e desenvolvimento de materiais metálicos, cerâmicos e polímeros aplicados à indústria.'
  },
  {
    instituicao: 'IFBA',
    campus: 'Camaçari - Campus Camaçari',
    nomeProg: 'Mestrado Profissional em Propriedade Intelectual e Transferência de Tecnologia (PROFNIT)',
    eixo: 'Gestão e Negócios',
    mestradoAcad: false, mestradoProf: true, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Foco em propriedade intelectual, transferência de tecnologia e proteção de patentes para inovação.'
  },

  // IF Baiano
  {
    instituicao: 'IF Baiano',
    campus: 'Serrinha - Campus Serrinha',
    nomeProg: 'Mestrado Profissional em Ciências Ambientais (MPCA)',
    eixo: 'Agrárias e Ambientais',
    mestradoAcad: false, mestradoProf: true, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Estudos sobre impacto ambiental, conservação de ecossistemas no semiárido e recursos hídricos.'
  },
  {
    instituicao: 'IF Baiano',
    campus: 'Guanambi - Campus Guanambi',
    nomeProg: 'Mestrado Profissional em Produção Vegetal no Semiárido (PPGPV)',
    eixo: 'Agrárias e Ambientais',
    mestradoAcad: false, mestradoProf: true, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Tecnologias de cultivo adaptadas às condições de semiaridez, convivência com a seca e fitotecnia regional.'
  },
  {
    instituicao: 'IF Baiano',
    campus: 'Catu - Campus Catu',
    nomeProg: 'Mestrado Profissional em Educação Profissional e Tecnológica (ProfEPT)',
    eixo: 'Educação',
    mestradoAcad: false, mestradoProf: true, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: false,
    detalhes: 'Formação e desenvolvimento de práticas educativas voltadas para a educação profissional nos institutos federais.'
  },
  {
    instituicao: 'IF Baiano',
    campus: 'Valença - Campus Valença',
    nomeProg: 'Doutorado Interinstitucional em Extensão Rural (DINTER)',
    eixo: 'Agrárias e Ambientais',
    mestradoAcad: false, mestradoProf: false, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: false,
    detalhes: 'Doutorado interinstitucional com foco em desenvolvimento rural, extensão agrícola e políticas para o semiárido.'
  },

  // UEFS
  {
    instituicao: 'UEFS',
    campus: 'Feira de Santana - Campus Universitário',
    nomeProg: 'Programa de Pós-Graduação em Educação (PPGEdu)',
    eixo: 'Educação',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Foco na formação continuada de educadores, práticas escolares e sociologia da educação.'
  },
  {
    instituicao: 'UEFS',
    campus: 'Feira de Santana - Campus Universitário',
    nomeProg: 'Mestrado em Biotecnologia',
    eixo: 'Saúde e Biológicas',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Pesquisas aplicadas em recursos genéticos, caracterização molecular, bioativos vegetais e bioprocessos.'
  },

  // UESC
  {
    instituicao: 'UESC',
    campus: 'Ilhéus - Campus Soane Nazaré de Alencar',
    nomeProg: 'Mestrado em Ciência da Computação (PPGCOMP)',
    eixo: 'Tecnologia e Informática',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Modelagem computacional, otimização de sistemas, inteligência artificial e internet das coisas.'
  },
  {
    instituicao: 'UESC',
    campus: 'Ilhéus - Campus Soane Nazaré de Alencar',
    nomeProg: 'Programa de Pós-Graduação em Produção Vegetal',
    eixo: 'Agrárias e Ambientais',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Estudos de fitotecnia, melhoramento de plantas tropicais (cacau), entomologia agrícola e solo.'
  },

  // UFSB
  {
    instituicao: 'UFSB',
    campus: 'Porto Seguro - Campus Sosígenes Costa',
    nomeProg: 'Programa de Pós-Graduação em Ciências Sociais',
    eixo: 'Humanas e Sociais',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Pesquisas em dinâmicas culturais, desigualdade social, direitos humanos e cidadania no sul da Bahia.'
  },
  {
    instituicao: 'UFSB',
    campus: 'Itabuna - Campus Jorge Amado',
    nomeProg: 'Programa de Pós-Graduação em Biossistemas',
    eixo: 'Saúde e Biológicas',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Estudos de biodiversidade, interações ecológicas, fisiologia animal/vegetal e biologia integrativa.'
  },

  // UFOB
  {
    instituicao: 'UFOB',
    campus: 'Barreiras - Campus Reitor Edgard Santos',
    nomeProg: 'Programa de Pós-Graduação em Ciências Ambientais',
    eixo: 'Agrárias e Ambientais',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Políticas de conservação do Cerrado, recursos hídricos, impactos da expansão agrícola no oeste baiano.'
  },
  {
    instituicao: 'UFOB',
    campus: 'Barreiras - Campus Reitor Edgard Santos',
    nomeProg: 'Mestrado Profissional em Saúde da Família',
    eixo: 'Saúde e Biológicas',
    mestradoAcad: false, mestradoProf: true, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Estratégia de Saúde da Família, atenção básica no SUS, saúde coletiva e intervenção comunitária.'
  },

  // UESB
  {
    instituicao: 'UESB',
    campus: 'Vitória da Conquista - Campus Universitário',
    nomeProg: 'Programa de Pós-Graduação em Enfermagem e Saúde',
    eixo: 'Saúde e Biológicas',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Assistência de enfermagem, vigilância epidemiológica, políticas de saúde pública e cuidado humanizado.'
  },
  {
    instituicao: 'UESB',
    campus: 'Itapetinga - Campus Universitário',
    nomeProg: 'Programa de Pós-Graduação em Zootecnia',
    eixo: 'Agrárias e Ambientais',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Produção e nutrição de ruminantes, forragicultura, melhoramento genético animal no semiárido.'
  },

  // UNIVASF
  {
    instituicao: 'UNIVASF',
    campus: 'Juazeiro - Campus Juazeiro',
    nomeProg: 'Programa de Pós-Graduação em Engenharia Agrícola',
    eixo: 'Engenharias e Exatas',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Tecnologia de irrigação, recursos de água e solo, construções rurais no vale do submédio São Francisco.'
  },

  // UNIFACS
  {
    instituicao: 'UNIFACS',
    campus: 'Salvador - Campus Tancredo Neves',
    nomeProg: 'Programa de Pós-Graduação em Sistemas e Computação (PPGSC)',
    eixo: 'Tecnologia e Informática',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Desenvolvimento de sistemas computacionais, redes de computadores, internet das coisas e IA aplicada.'
  },
  {
    instituicao: 'UNIFACS',
    campus: 'Salvador - Campus Tancredo Neves',
    nomeProg: 'Programa de Pós-Graduação em Administração (PPGA)',
    eixo: 'Gestão e Negócios',
    mestradoAcad: true, mestradoProf: true, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Inovação e competitividade, finanças de mercado, gestão estratégica de pessoas e sustentabilidade organizacional.'
  },

  // UCSal
  {
    instituicao: 'UCSal',
    campus: 'Salvador - Campus Pituaçu',
    nomeProg: 'Programa de Pós-Graduação em Políticas Sociais e Cidadania',
    eixo: 'Humanas e Sociais',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: true, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Direitos sociais, políticas públicas de combate à pobreza, movimentos comunitários e cidadania urbana.'
  },

  // Unijorge
  {
    instituicao: 'Unijorge',
    campus: 'Salvador - Campus Paralela',
    nomeProg: 'Mestrado Profissional em Gestão e Negócios',
    eixo: 'Gestão e Negócios',
    mestradoAcad: false, mestradoProf: true, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Metodologias ágeis, inovação corporativa, desenvolvimento local, finanças de negócios e mercado baiano.'
  }
];

const FALLBACKS_EDITEIS = [];


// Helper para escapar campos do CSV conforme RFC 4180
function escapeCSV(val) {
  if (val === undefined || val === null) return '';
  let str = String(val).trim();
  str = str.replace(/"/g, '""');
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str}"`;
  }
  return str;
}

// Limpa HTML
function cleanHTML(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

// Cria diretórios nível por nível robustamente
function criarDiretorioRobustamente(dirPath) {
  if (fs.existsSync(dirPath)) return;
  const parts = dirPath.split(path.sep);
  let currentPath = '';
  for (const part of parts) {
    if (!part) {
      currentPath += path.sep;
      continue;
    }
    if (part.endsWith(':')) {
      currentPath = part + path.sep;
      continue;
    }
    currentPath = path.join(currentPath, part);
    if (!fs.existsSync(currentPath)) {
      let retries = 3;
      while (retries > 0) {
        try {
          fs.mkdirSync(currentPath);
          break;
        } catch (e) {
          if (e.code === 'EEXIST') break;
          retries--;
          if (retries === 0) {
            if (fs.existsSync(currentPath) || e.code === 'EEXIST') break;
            throw e;
          }
          const start = Date.now();
          while (Date.now() - start < 150) {}
        }
      }
    }
  }
}

// Salva editais no formato estruturado DATA > ANO > MES (arquivos nomeados como TEMA-NOMEMES-ANO)
function salvarHistoricoEdital(tema, editais, dataEspecifica = null) {
  if (editais.length === 0) return;

  const refDate = dataEspecifica || new Date();
  const ano = refDate.getFullYear().toString();
  const mesNum = String(refDate.getMonth() + 1).padStart(2, '0');
  const nomeMes = NOMES_MESES[refDate.getMonth()];

  const dirPath = path.join(__dirname, 'DATA', ano, mesNum);
  criarDiretorioRobustamente(dirPath);

  const csvPath = path.join(dirPath, `${tema}-${nomeMes}-${ano}.csv`);
  const jsonPath = path.join(dirPath, `${tema}-${nomeMes}-${ano}.json`);

  // 1. Gravar CSV
  let csvContent = '';
  if (!fs.existsSync(csvPath)) {
    csvContent = 'data_coleta,titulo,resumo,instituicao,nivel,area,vagas,inscricoes_inicio,inscricoes_fim,url,status,data_publicacao,fonte\n';
  }

  const dataColeta = refDate.toISOString();
  editais.forEach(e => {
    csvContent += `${escapeCSV(dataColeta)},${escapeCSV(e.titulo)},${escapeCSV(e.resumo)},${escapeCSV(e.instituicao)},${escapeCSV(e.nivel)},${escapeCSV(e.area)},${escapeCSV(e.vagas)},${escapeCSV(e.inscricoesInicio)},${escapeCSV(e.inscricoesFim)},${escapeCSV(e.url)},${escapeCSV(e.status)},${escapeCSV(e.dataPublicacao)},${escapeCSV(e.fonte)}\n`;
  });

  fs.appendFileSync(csvPath, csvContent, 'utf-8');

  // 2. Gravar/Atualizar JSON
  let historicoDia = [];
  if (fs.existsSync(jsonPath)) {
    try {
      historicoDia = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } catch (err) {
      historicoDia = [];
    }
  }

  editais.forEach(e => {
    const index = historicoDia.findIndex(h => h.url === e.url && h.titulo === e.titulo);
    if (index !== -1) {
      const existente = historicoDia[index];
      // Se a data de fim de inscrição mudou (ex: prorrogação), nós atualizamos os campos relevantes
      if (new Date(e.inscricoesFim) > new Date(existente.inscricoesFim)) {
        console.log(`[Prorrogação] Edital prorrogado detectado! Atualizando prazo do edital: "${e.titulo}" de ${existente.inscricoesFim} para ${e.inscricoesFim}`);
        historicoDia[index] = {
          ...existente,
          resumo: e.resumo,
          vagas: e.vagas,
          inscricoesInicio: e.inscricoesInicio,
          inscricoesFim: e.inscricoesFim,
          status: e.status,
          dataPublicacao: e.dataPublicacao,
          fonte: e.fonte
        };
      }
    } else {
      historicoDia.push({
        dataColeta,
        titulo: e.titulo,
        resumo: e.resumo,
        instituicao: e.instituicao,
        nivel: e.nivel,
        area: e.area,
        vagas: e.vagas,
        inscricoesInicio: e.inscricoesInicio,
        inscricoesFim: e.inscricoesFim,
        url: e.url,
        status: e.status,
        dataPublicacao: e.dataPublicacao,
        fonte: e.fonte
      });
    }
  });

  historicoDia.sort((a, b) => new Date(b.dataPublicacao) - new Date(a.dataPublicacao));
  fs.writeFileSync(jsonPath, JSON.stringify(historicoDia, null, 2), 'utf-8');
}

// Salva de forma destrutiva/sobrescrevendo (usado no sementador retroativo)
function salvarHistoricoEditalSobrescrevendo(tema, editais, dataEspecifica) {
  if (editais.length === 0) return;

  const ano = dataEspecifica.getFullYear().toString();
  const mesNum = String(dataEspecifica.getMonth() + 1).padStart(2, '0');
  const nomeMes = NOMES_MESES[dataEspecifica.getMonth()];

  const dirPath = path.join(__dirname, 'DATA', ano, mesNum);
  criarDiretorioRobustamente(dirPath);

  const csvPath = path.join(dirPath, `${tema}-${nomeMes}-${ano}.csv`);
  const jsonPath = path.join(dirPath, `${tema}-${nomeMes}-${ano}.json`);

  // 1. Gravar CSV
  let csvContent = 'data_coleta,titulo,resumo,instituicao,nivel,area,vagas,inscricoes_inicio,inscricoes_fim,url,status,data_publicacao,fonte\n';
  const dataColeta = dataEspecifica.toISOString();
  editais.forEach(e => {
    csvContent += `${escapeCSV(dataColeta)},${escapeCSV(e.titulo)},${escapeCSV(e.resumo)},${escapeCSV(e.instituicao)},${escapeCSV(e.nivel)},${escapeCSV(e.area)},${escapeCSV(e.vagas)},${escapeCSV(e.inscricoesInicio)},${escapeCSV(e.inscricoesFim)},${escapeCSV(e.url)},${escapeCSV(e.status)},${escapeCSV(e.dataPublicacao)},${escapeCSV(e.fonte)}\n`;
  });
  fs.writeFileSync(csvPath, csvContent, 'utf-8');

  // 2. Gravar JSON
  const historicoDia = editais.map(e => ({
    dataColeta,
    titulo: e.titulo,
    resumo: e.resumo,
    instituicao: e.instituicao,
    nivel: e.nivel,
    area: e.area,
    vagas: e.vagas,
    inscricoesInicio: e.inscricoesInicio,
    inscricoesFim: e.inscricoesFim,
    url: e.url,
    status: e.status,
    dataPublicacao: e.dataPublicacao,
    fonte: e.fonte
  }));
  fs.writeFileSync(jsonPath, JSON.stringify(historicoDia, null, 2), 'utf-8');
}

// Busca recursiva de arquivos JSON de editais, ignorando perfis e outros
function buscarArquivosJSON(dir, filesList = []) {
  if (!fs.existsSync(dir)) return filesList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      // Se estivermos dentro da pasta de um ano, só entra se a subpasta for um mês (2 dígitos)
      const parentDir = path.basename(dir);
      const isYearDir = /^\d{4}$/.test(parentDir);
      if (isYearDir && !/^\d{2}$/.test(file)) {
        continue;
      }
      buscarArquivosJSON(name, filesList);
    } else if (file.endsWith('.json')) {
      // Ignora arquivos JSON que estão direto na pasta do ano (arquivos consolidados)
      const parentDir = path.basename(dir);
      const isYearDir = /^\d{4}$/.test(parentDir);
      if (isYearDir) {
        continue;
      }
      filesList.push(name);
    }
  }
  return filesList;
}

// Gera o arquivo metricas.json consolidando dados históricos
function gerarMetricas() {
  console.log("Compilando estatísticas e métricas de editais...");
  const dataDirPath = path.join(__dirname, 'DATA');
  const jsonFiles = buscarArquivosJSON(dataDirPath);
  
  let todosEditais = [];
  
  jsonFiles.forEach(file => {
    try {
      const content = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (Array.isArray(content)) {
        todosEditais = todosEditais.concat(content);
      }
    } catch (e) {
      console.error(`Erro ao ler arquivo para métricas: ${file}`, e.message);
    }
  });

  // Remove duplicados baseados em título e URL
  const chavesUnicas = new Set();
  const editaisUnicos = [];
  todosEditais.forEach(e => {
    const chave = `${e.titulo}-${e.url}`;
    if (!chavesUnicas.has(chave)) {
      chavesUnicas.add(chave);
      editaisUnicos.push(e);
    }
  });

  const totalGeral = editaisUnicos.length;
  
  // 1. Por Nível (Mestrado Acad/Prof, Doutorado Acad/Prof, Aluno Especial)
  const totaisNiveis = {
    'Mestrado Acadêmico': 0,
    'Mestrado Profissional': 0,
    'Doutorado Acadêmico': 0,
    'Doutorado Profissional': 0,
    'Aluno Especial': 0
  };

  // 2. Por Área de Interesse (Dinamicamente mapeado de TEMAS_INTERESSE)
  const totaisAreas = {};
  Object.keys(TEMAS_INTERESSE).forEach(a => {
    totaisAreas[a] = 0;
  });

  // 3. Por Instituição
  const contagemInstituicoes = {};

  // 4. Por Status
  const contagemStatus = { 'Aberto': 0, 'Encerrado': 0, 'Em andamento': 0 };

  editaisUnicos.forEach(e => {
    if (totaisNiveis[e.nivel] !== undefined) totaisNiveis[e.nivel]++;
    if (totaisAreas[e.area] !== undefined) totaisAreas[e.area]++;
    if (contagemStatus[e.status] !== undefined) contagemStatus[e.status]++;
    
    contagemInstituicoes[e.instituicao] = (contagemInstituicoes[e.instituicao] || 0) + 1;
  });

  const rankingInst = Object.entries(contagemInstituicoes)
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total);

  const metricas = {
    geradoEm: new Date().toISOString(),
    totalGeral,
    totaisNiveis,
    totaisAreas,
    status: contagemStatus,
    porInstituicao: rankingInst
  };

  const metricasPath = path.join(__dirname, 'metricas.json');
  fs.writeFileSync(metricasPath, JSON.stringify(metricas, null, 2), 'utf-8');
  console.log(`Métricas consolidadas salvas em: ${metricasPath}`);
}

// Mapeamento de sites oficiais para correção de URLs geradas
const SITES_INSTITUICOES = {
  'UFBA': 'https://www.ufba.br',
  'UFRB': 'https://ufrb.edu.br',
  'UNEB': 'https://www.uneb.br',
  'IFBA': 'https://portal.ifba.edu.br',
  'IF Baiano': 'https://ifbaiano.edu.br',
  'UEFS': 'http://www.uefs.br',
  'UESC': 'http://www.uesc.br',
  'UFSB': 'https://ufsb.edu.br',
  'UNIFACS': 'https://www.unifacs.br',
  'UCSal': 'http://www.ucsal.br',
  'UNIFTC': 'https://www.uniftc.edu.br',
  'UFOB': 'https://ufob.edu.br',
  'UESB': 'https://www.uesb.br',
  'UNIVASF': 'https://www.univasf.edu.br',
  'Unijorge': 'https://www.unijorge.edu.br',
  'UNILAB': 'https://unilab.edu.br',
  'SENAI CIMATEC': 'https://www.senaicimatec.com.br',
  'EBMSP': 'https://www.bahiana.edu.br'
};

// Sementador histórico retroativo de 2 anos (Junho 2024 a Junho 2026)
function verificarEGerarHistoricoRetroativo() {
  const dataDirPath = path.join(__dirname, 'DATA');
  
  // Verifica se todos os anos (2024, 2025, 2026) possuem os arquivos JSON consolidados principais
  let historicoCompleto = true;
  const anosEsperados = ['2024', '2025', '2026'];
  const temasEsperados = ['mestrado', 'doutorado', 'aluno-especial'];
  
  if (!fs.existsSync(dataDirPath)) {
    historicoCompleto = false;
  } else {
    for (const ano of anosEsperados) {
      for (const tema of temasEsperados) {
        const jsonPath = path.join(dataDirPath, ano, `${tema}.json`);
        if (!fs.existsSync(jsonPath)) {
          historicoCompleto = false;
          break;
        }
      }
      if (!historicoCompleto) break;
    }
  }

  if (historicoCompleto) {
    console.log("Histórico retroativo de editais completo na pasta DATA. Pulando geração...");
    return;
  }

  console.log("Histórico retroativo incompleto ou inexistente na pasta DATA. Iniciando geração de dados históricos dos últimos 2 anos (2024 a 2026)...");
  
  // Apaga e recria de forma limpa
  if (fs.existsSync(dataDirPath)) {
    try {
      fs.rmSync(dataDirPath, { recursive: true, force: true });
    } catch (e) {
      console.warn("Aviso ao limpar diretório DATA:", e.message);
    }
  }
  criarDiretorioRobustamente(dataDirPath);

  console.log("Iniciando geração de dados históricos retroativos dos últimos 2 anos de editais (2024 a 2026)...");

  const periodos = [];
  // 2024 Completo (Meses 6 a 12)
  for (let m = 6; m <= 12; m++) {
    periodos.push({ ano: 2024, mes: m });
  }
  // 2025 Completo (Meses 1 a 12)
  for (let m = 1; m <= 12; m++) {
    periodos.push({ ano: 2025, mes: m });
  }
  // 2026 até Maio (Meses 1 a 5, Junho é o mês atual)
  for (let m = 1; m <= 5; m++) {
    periodos.push({ ano: 2026, mes: m });
  }

  for (const p of periodos) {
    const ano = p.ano;
    const mes = p.mes;

    // Agrupamento mensal de editais fictícios consistentes
    const editaisAgrupados = {
      'mestrado': [],
      'doutorado': [],
      'aluno-especial': []
    };

    // Gera de 3 a 5 editais por mês
    const totalEditaisMes = 3 + ((ano + mes) % 3);
    for (let i = 0; i < totalEditaisMes; i++) {
      const seedVal = ano + mes + i;
      const prog = PROGRAMAS_REAIS[seedVal % PROGRAMAS_REAIS.length];
      
      // Define o nível baseado no programa
      let nivel = "Mestrado Acadêmico";
      let pastaTema = "mestrado";

      const nivelSeed = seedVal % 5;
      if (nivelSeed === 0 && prog.mestradoAcad) {
        nivel = "Mestrado Acadêmico";
        pastaTema = "mestrado";
      } else if (nivelSeed === 1 && prog.mestradoProf) {
        nivel = "Mestrado Profissional";
        pastaTema = "mestrado";
      } else if (nivelSeed === 2 && prog.doutoradoAcad) {
        nivel = "Doutorado Acadêmico";
        pastaTema = "doutorado";
      } else if (nivelSeed === 3 && prog.doutoradoProf) {
        nivel = "Doutorado Profissional";
        pastaTema = "doutorado";
      } else if (prog.alunoEspecial) {
        nivel = "Aluno Especial";
        pastaTema = "aluno-especial";
      } else {
        nivel = prog.mestradoAcad ? "Mestrado Acadêmico" : "Mestrado Profissional";
        pastaTema = "mestrado";
      }

      const numEdital = `${String(1 + (seedVal % 15)).padStart(2, '0')}/${ano}`;
      const titulo = `Edital ${prog.instituicao} ${numEdital} - Seleção de Candidatos para ${nivel} - ${prog.nomeProg}`;
      
      let resumo = `O ${prog.nomeProg} da ${prog.instituicao} torna público o edital de abertura de inscrições para o processo seletivo de alunos para o curso de ${nivel}. ${prog.detalhes} Eixo temático concentrado em ${prog.eixo}.`;
      if (nivel === "Aluno Especial") {
        resumo = `Estão abertas as inscrições para a seleção de Alunos Especiais (disciplinas isoladas) no ${prog.nomeProg} da ${prog.instituicao}. Vagas distribuídas em disciplinas teóricas e metodológicas vinculadas à área de ${prog.eixo}.`;
      }

      // Inscrições abrem no dia 2 do mês e fecham no dia 22 do mês
      const diaInicio = 2 + (i % 3);
      const diaFim = diaInicio + 15 + (i % 5);
      
      const inscStart = new Date(ano, mes - 1, diaInicio, 9, 0, 0).toISOString();
      const inscEnd = new Date(ano, mes - 1, diaFim, 23, 59, 59).toISOString();
      const dataPub = new Date(ano, mes - 1, diaInicio - 3, 10, 0, 0).toISOString();

      // Editais do passado estão encerrados
      const status = "Encerrado";

      const instSite = SITES_INSTITUICOES[prog.instituicao] || 'https://www.ufba.br';

      editaisAgrupados[pastaTema].push({
        titulo,
        resumo,
        instituicao: prog.instituicao,
        nivel,
        area: prog.eixo,
        vagas: 8 + (seedVal % 15),
        inscricoesInicio: inscStart,
        inscricoesFim: inscEnd,
        url: `${instSite}/noticias/selecao-${pastaTema}-${ano}-${mes}-${i}`,
        status,
        dataPublicacao: dataPub,
        fonte: `${prog.instituicao} Ingresso`
      });
    }

    // Inserir os editais reais solicitados pelo usuário para Aluno Especial em Janeiro de 2026 (Semestre 2026.1)
    if (ano === 2026 && mes === 1) {
      editaisAgrupados['aluno-especial'].push({
        titulo: "Edital FACOM/UFBA - Seleção de Aluno Especial - PósCom (Semestre 2026.1)",
        resumo: "Processo seletivo para admissão de Aluno Especial no Programa de Pós-Graduação em Comunicação e Cultura Contemporâneas (PósCom) da Faculdade de Comunicação (FACOM/UFBA) para o semestre 2026.1. Oportunidade para cursar disciplinas isoladas no Mestrado ou Doutorado.",
        instituicao: "UFBA",
        nivel: "Aluno Especial",
        area: "Comunicação",
        vagas: 15,
        inscricoesInicio: new Date(2026, 0, 5, 9, 0, 0).toISOString(),
        inscricoesFim: new Date(2026, 0, 20, 23, 59, 59).toISOString(),
        url: "http://poscom.ufba.br/alunoespecial20261",
        status: "Encerrado",
        dataPublicacao: new Date(2025, 11, 28, 10, 0, 0).toISOString(),
        fonte: "FACOM UFBA"
      });

      editaisAgrupados['aluno-especial'].push({
        titulo: "Edital ICI/UFBA - Seleção de Aluno Especial - PPGCI (Semestre 2026.1)",
        resumo: "O Programa de Pós-Graduação em Ciência da Informação (PPGCI) da Faculdade de Ciências da Informação (ICI/UFBA) torna pública a abertura de inscrições para seleção de aluno especial em disciplinas do curso.",
        instituicao: "UFBA",
        nivel: "Aluno Especial",
        area: "Informação e TI",
        vagas: 10,
        inscricoesInicio: new Date(2026, 0, 6, 9, 0, 0).toISOString(),
        inscricoesFim: new Date(2026, 0, 22, 23, 59, 59).toISOString(),
        url: "https://ppgci.ufba.br/es/node/1425",
        status: "Encerrado",
        dataPublicacao: new Date(2025, 11, 29, 10, 0, 0).toISOString(),
        fonte: "PPGCI UFBA"
      });
    }

    // Grava os editais nos diretórios correspondentes
    const refDate = new Date(ano, mes - 1, 15);
    for (const tema of ['mestrado', 'doutorado', 'aluno-especial']) {
      if (editaisAgrupados[tema].length > 0) {
        salvarHistoricoEditalSobrescrevendo(tema, editaisAgrupados[tema], refDate);
      }
    }
  }

  console.log("Histórico retroativo de editais criado com sucesso!");
}

// Função para identificar e filtrar caminhos genéricos de portais (landing pages)
function ehUrlGenerica(urlStr) {
  try {
    const parsed = new URL(urlStr);
    let path = parsed.pathname.toLowerCase();
    path = path.replace(/^\/+|\/+$/g, ''); // Remove barras no início e fim
    
    if (!path) return true;
    
    const caminhosGenericos = [
      'pos-graduacao', 'pos_graduacao', 'posgraduacao',
      'ingresso', 'ingresso-de-estudantes', 'ingresso-de-estudantes/pos-graduacao',
      'cursos', 'cursos/pos-graduacao', 'cursos/pos_graduacao',
      'editais', 'editais/pos-graduacao',
      'prosel', 'portal/prosel',
      'prosis/processos-seletivos/pos-graduacao',
      'portal', 'portal/pos-graduacao',
      'noticias', 'noticias/@@rss'
    ];
    
    if (caminhosGenericos.includes(path)) return true;
    
    for (const cg of caminhosGenericos) {
      if (path.endsWith(cg)) return true;
    }
  } catch (e) {
    // Ignora erros de parse
  }
  return false;
}

// Busca editais reais no Google via Serper.dev e le com ScraperAPI se as chaves estiverem configuradas
async function buscarNovosEditais() {
  console.log("Iniciando busca direta e em tempo real nos portais SIGAA (UFBA, UFRB, UFSB, UFOB, UNILAB)...");
  
  const resultados = {
    'mestrado': [],
    'doutorado': [],
    'aluno-especial': []
  };

  const sigaaPortais = [
    { sigla: 'UFBA', url: 'https://sigaa.ufba.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=S' },
    { sigla: 'UFRB', url: 'https://sistemas.ufrb.edu.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=S' },
    { sigla: 'UFSB', url: 'https://sig.ufsb.edu.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=S' },
    { sigla: 'UFOB', url: 'https://sig.ufob.edu.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=S' },
    { sigla: 'UNILAB', url: 'https://sigaa.unilab.edu.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=S' }
  ];

  for (const portal of sigaaPortais) {
    try {
      const portalEditais = await rasparSigaaPortalDirect(portal.sigla, portal.url);
      console.log(`[SIGAA ${portal.sigla}] Encontrados ${portalEditais.length} editais reais.`);
      portalEditais.forEach(ed => {
        let pasta = "mestrado";
        if (ed.nivel === "Aluno Especial") {
          pasta = "aluno-especial";
        } else if (ed.nivel.startsWith("Doutorado")) {
          pasta = "doutorado";
        }
        const jaExiste = resultados[pasta].some(x => x.titulo === ed.titulo);
        if (!jaExiste) {
          resultados[pasta].push(ed);
        }
      });
    } catch (err) {
      console.error(`Erro ao raspar SIGAA ${portal.sigla} diretamente:`, err.message);
    }
  }

  return resultados;
}

// Simula busca por novos editais no presente (fallback caso chaves de API nao existam)
async function buscarNovosEditaisSimulados() {
  console.log("Simulação desativada. Retornando dados vazios.");
  return {
    'mestrado': [],
    'doutorado': [],
    'aluno-especial': []
  };
}


// ══ RASPADOR DIRETO E INTEGRADO DE PORTAIS SIGAA ══
async function rasparSigaaPortalDirect(sigla, url) {
  console.log(`[SIGAA ${sigla}] Buscando processos seletivos diretamente de: ${url}`);
  
  const editaisEncontrados = [];
  const hoje = new Date();
  
  try {
    const response = await httpRequest({
      url: url,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (response.statusCode !== 200) {
      console.log(`[SIGAA ${sigla}] Erro ao acessar. Status: ${response.statusCode}`);
      return [];
    }

    const html = response.data;
    const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    let currentEdital = '';
    
    while ((trMatch = trRegex.exec(html)) !== null) {
      const trContent = trMatch[1];
      const agrupadorMatch = trContent.match(/class=["']agrupador["']/i) || trContent.match(/colspan=["'](?:4|5)["']/i);
      if (agrupadorMatch) {
        let cleanText = trContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        cleanText = decodeEntities(cleanText);
        if (cleanText) {
          currentEdital = cleanText;
        }
        continue;
      }
      
      const tdRegex = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
      let tdMatch;
      const tds = [];
      while ((tdMatch = tdRegex.exec(trContent)) !== null) {
        tds.push(tdMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
      }
      
      if (tds.length >= 3) {
        const hasDateRange = tds.some(td => /\d{2}\/\d{2}\/\d{4}/.test(td));
        if (hasDateRange) {
          const course = decodeEntities(tds[0]);
          const vacanciesRaw = tds[1];
          const periodRaw = tds[2];
          
          const editalNome = currentEdital ? currentEdital : `Processo Seletivo ${sigla}`;
          const { start, end } = parsePeriodo(periodRaw);
          
          // Filtra processos seletivos antigos (só aceita editais que encerram a partir de Junho/2026)
          const limiteHistorico = new Date('2026-06-01T00:00:00.000Z');
          if (end < limiteHistorico) {
            continue;
          }
          
          const vagas = parseInt(vacanciesRaw, 10) || 10;
          const status = end >= hoje ? "Aberto" : "Encerrado";
          
          let nivel = "Mestrado Acadêmico";
          let pastaTema = "mestrado";
          const combinedLower = (editalNome + " " + course).toLowerCase();
          
          const alunoEspecialTerms = ["aluno especial", "matricula especial", "matrícula especial", "estudante especial", "disciplina isolada", "disciplinas isoladas", "vaga isolada", "vagas isoladas", "estudante isolado"];
          const ehEspecial = alunoEspecialTerms.some(term => combinedLower.includes(term));
          if (ehEspecial) {
            nivel = "Aluno Especial";
            pastaTema = "aluno-especial";
          } else if (combinedLower.includes("doutorado")) {
            nivel = combinedLower.includes("profissional") ? "Doutorado Profissional" : "Doutorado Acadêmico";
            pastaTema = "doutorado";
          } else if (combinedLower.includes("mestrado")) {
            nivel = combinedLower.includes("profissional") ? "Mestrado Profissional" : "Mestrado Acadêmico";
            pastaTema = "mestrado";
          }
          
          let area = "Saúde e Biológicas";
          let maxContagem = 0;
          for (const [temaNome, keywords] of Object.entries(TEMAS_INTERESSE)) {
            let contagem = 0;
            keywords.forEach(kw => {
              const regex = new RegExp(`\\b${kw}\\b`, 'gi');
              const matches = combinedLower.match(regex);
              if (matches) contagem += matches.length;
            });
            if (contagem > maxContagem) {
              maxContagem = contagem;
              area = temaNome;
            }
          }
          
          const tituloEdital = `${editalNome} - ${course}`;
          const resumoEdital = `Inscrições abertas para o processo seletivo da ${sigla} de ingresso no curso: ${course}. Vagas ofertadas: ${vagas}. Período de inscrições de ${periodRaw}. Consulte o edital completo no portal oficial da instituição.`;
          
          editaisEncontrados.push({
            titulo: tituloEdital.substring(0, 150),
            resumo: resumoEdital.substring(0, 350),
            instituicao: sigla,
            nivel: nivel,
            area: area,
            vagas: vagas,
            inscricoesInicio: start.toISOString(),
            inscricoesFim: end.toISOString(),
            url: url,
            status: status,
            dataPublicacao: start.toISOString(),
            fonte: `${sigla} SIGAA`
          });
        }
      }
    }
  } catch (err) {
    console.error(`[SIGAA ${sigla}] Falha na raspagem direta:`, err.message);
  }
  
  return editaisEncontrados;
}

function parsePeriodo(periodoStr) {
  const pClean = periodoStr.replace(/\xa0/g, ' ').replace(/\u00a0/g, ' ').replace(/&nbsp;/g, ' ').trim();
  const parts = pClean.split(/\s+(?:a|à|-)\s+|\s*-\s*/i);
  let start = new Date();
  let end = new Date();
  
  const parseDate = (dStr) => {
    const matches = dStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (matches) {
      const day = parseInt(matches[1], 10);
      const month = parseInt(matches[2], 10) - 1;
      const year = parseInt(matches[3], 10);
      return new Date(year, month, day, 12, 0, 0);
    }
    return new Date();
  };
  
  if (parts.length >= 2) {
    start = parseDate(parts[0]);
    end = parseDate(parts[1]);
  } else if (parts.length === 1) {
    start = parseDate(parts[0]);
    end = start;
  }
  return { start, end };
}

function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&aacute;/g, 'á')
    .replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú')
    .replace(/&atilde;/g, 'ã')
    .replace(/&otilde;/g, 'õ')
    .replace(/&acirc;/g, 'â')
    .replace(/&ecirc;/g, 'ê')
    .replace(/&icirc;/g, 'î')
    .replace(/&ocirc;/g, 'ô')
    .replace(/&ucirc;/g, 'û')
    .replace(/&ccedil;/g, 'ç')
    .replace(/&Aacute;/g, 'Á')
    .replace(/&Eacute;/g, 'É')
    .replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó')
    .replace(/&Uacute;/g, 'Ú')
    .replace(/&Atilde;/g, 'Ã')
    .replace(/&Otilde;/g, 'Õ')
    .replace(/&Acirc;/g, 'Â')
    .replace(/&Ecirc;/g, 'Ê')
    .replace(/&Icirc;/g, 'Î')
    .replace(/&Ocirc;/g, 'Ô')
    .replace(/&Ucirc;/g, 'Û')
    .replace(/&Ccedil;/g, 'Ç');
}

// Consolda arquivos de um determinado ano
function consolidarAno(ano) {
  const anoDir = path.join(__dirname, 'DATA', ano);
  if (!fs.existsSync(anoDir)) return;
  
  const meses = fs.readdirSync(anoDir).filter(m => /^\d{2}$/.test(m) && fs.statSync(path.join(anoDir, m)).isDirectory());
  
  for (const tema of ['mestrado', 'doutorado', 'aluno-especial']) {
    let todosTema = [];
    for (const mes of meses) {
      const nomeMes = NOMES_MESES[parseInt(mes) - 1];
      const jsonPath = path.join(anoDir, mes, `${tema}-${nomeMes}-${ano}.json`);
      if (fs.existsSync(jsonPath)) {
        try {
          const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
          if (Array.isArray(content)) {
            todosTema = todosTema.concat(content);
          }
        } catch (e) {
          console.error(`Erro ao ler arquivo ${jsonPath} para consolidação anual:`, e.message);
        }
      }
    }
    
    // Deduplicar mantendo o edital com maior prazo (caso de prorrogação)
    const mapaEditais = new Map();
    todosTema.forEach(e => {
      const chave = `${e.titulo}-${e.url}`;
      if (!mapaEditais.has(chave)) {
        mapaEditais.set(chave, e);
      } else {
        const existente = mapaEditais.get(chave);
        if (new Date(e.inscricoesFim) > new Date(existente.inscricoesFim)) {
          mapaEditais.set(chave, e);
        }
      }
    });

    const editaisUnicos = Array.from(mapaEditais.values());
    editaisUnicos.forEach(e => {
      // Atualizar status conforme data limite dinamicamente no compilador
      const hoje = new Date();
      const prazoFim = new Date(e.inscricoesFim);
      if (prazoFim < hoje) {
        e.status = 'Encerrado';
      } else {
        e.status = 'Aberto';
      }
    });
    
    editaisUnicos.sort((a, b) => new Date(b.dataPublicacao) - new Date(a.dataPublicacao));
    
    // Gravar JSON
    const outputJsonPath = path.join(anoDir, `${tema}.json`);
    fs.writeFileSync(outputJsonPath, JSON.stringify(editaisUnicos, null, 2), 'utf-8');
    
    // Gravar CSV
    const outputCsvPath = path.join(anoDir, `${tema}.csv`);
    let csvContent = 'data_coleta,titulo,resumo,instituicao,nivel,area,vagas,inscricoes_inicio,inscricoes_fim,url,status,data_publicacao,fonte\n';
    editaisUnicos.forEach(e => {
      csvContent += `${escapeCSV(e.dataColeta)},${escapeCSV(e.titulo)},${escapeCSV(e.resumo)},${escapeCSV(e.instituicao)},${escapeCSV(e.nivel)},${escapeCSV(e.area)},${escapeCSV(e.vagas)},${escapeCSV(e.inscricoesInicio)},${escapeCSV(e.inscricoesFim)},${escapeCSV(e.url)},${escapeCSV(e.status)},${escapeCSV(e.dataPublicacao)},${escapeCSV(e.fonte)}\n`;
    });
    fs.writeFileSync(outputCsvPath, csvContent, 'utf-8');
  }
}

// Consolida todos os anos existentes na pasta DATA
function consolidarTodosAnos() {
  console.log("Consolidando arquivos históricos anuais...");
  const dataDir = path.join(__dirname, 'DATA');
  if (!fs.existsSync(dataDir)) return;
  const anos = fs.readdirSync(dataDir).filter(a => /^\d{4}$/.test(a) && fs.statSync(path.join(dataDir, a)).isDirectory());
  for (const ano of anos) {
    consolidarAno(ano);
  }
  console.log("Consolidação anual concluída!");
}

// Gera o arquivo ultimos-editais.json contendo apenas os editais que ainda estão abertos
function gerarUltimosEditais() {
  console.log("Gerando arquivo de editais abertos (ultimos-editais.json)...");
  
  const dataDirPath = path.join(__dirname, 'DATA');
  const jsonFiles = buscarArquivosJSON(dataDirPath);
  
  let todosEditais = [];
  
  jsonFiles.forEach(file => {
    try {
      const content = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (Array.isArray(content)) {
        todosEditais = todosEditais.concat(content);
      }
    } catch (e) {
      console.error(`Erro ao ler arquivo para ultimos-editais: ${file}`, e.message);
    }
  });

  // Deduplicar mantendo o de maior prazo (caso de prorrogação)
  const mapaEditais = new Map();
  todosEditais.forEach(e => {
    const chave = `${e.titulo}-${e.url}`;
    if (!mapaEditais.has(chave)) {
      mapaEditais.set(chave, e);
    } else {
      const existente = mapaEditais.get(chave);
      if (new Date(e.inscricoesFim) > new Date(existente.inscricoesFim)) {
        mapaEditais.set(chave, e);
      }
    }
  });

  const editaisUnicos = Array.from(mapaEditais.values());

  // Filtrar para conter apenas os abertos (inscrições no futuro ou em andamento)
  const hoje = new Date();
  const editaisAbertos = editaisUnicos.filter(e => {
    const prazoFim = new Date(e.inscricoesFim);
    return prazoFim >= hoje;
  });

  // Atualiza o status para Aberto de todos os que estão nessa lista
  editaisAbertos.forEach(e => {
    e.status = 'Aberto';
  });

  // Ordenar por data de publicação decrescente
  editaisAbertos.sort((a, b) => new Date(b.dataPublicacao) - new Date(a.dataPublicacao));

  // Escrever ultimos-editais.json
  const ultimosEditaisPath = path.join(__dirname, 'ultimos-editais.json');
  fs.writeFileSync(ultimosEditaisPath, JSON.stringify({
    ultimaAtualizacao: new Date().toISOString(),
    editais: editaisAbertos
  }, null, 2), 'utf-8');

  console.log(`Salvos ${editaisAbertos.length} editais abertos em ${ultimosEditaisPath}`);
}

// Execução Principal do Compilador
async function executarCompilador() {
  console.log(`--- Iniciando Compilador de Editais da Bahia (${new Date().toLocaleString()}) ---`);

  // 1. Sementa o histórico de 2 anos se estiver vazio (Desativado conforme solicitação - foco de Junho 2026 em diante)
  // verificarEGerarHistoricoRetroativo();

  // 2. Coleta novos editais
  const editaisNovos = await buscarNovosEditais();

  // 3. Salva no histórico do mês atual
  for (const tema of ['mestrado', 'doutorado', 'aluno-especial']) {
    console.log(`Salvando editais recentes no histórico: ${tema} (${editaisNovos[tema].length} editais)`);
    try {
      salvarHistoricoEdital(tema, editaisNovos[tema]);
    } catch (err) {
      console.warn(`Aviso ao salvar histórico do tema '${tema}':`, err.message);
    }
  }

  // 4. Consolida os arquivos históricos anuais
  consolidarTodosAnos();

  // 5. Gera a compilação geral dos editais abertos
  gerarUltimosEditais();

  // 6. Atualiza métricas estatísticas de toda a base histórica
  gerarMetricas();

  console.log("--- Compilador de Editais Bahia finalizado com sucesso! ---");
}

executarCompilador();
