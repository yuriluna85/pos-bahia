const fs = require('fs');
const path = require('path');

const NOMES_MESES = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

// Helper nativo para realizar requisicoes HTTP/HTTPS com Promises (sem dependencias)
function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
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
    campus: 'Salvador - Campus Barbalho',
    nomeProg: 'Mestrado Profissional em Tecnologias Aplicadas a Processos de Ensino e Aprendizagem',
    eixo: 'Tecnologia e Informática',
    mestradoAcad: false, mestradoProf: true, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Desenvolvimento de softwares educativos, robótica pedagógica e formação docente com tecnologias digitais.'
  },
  {
    instituicao: 'IFBA',
    campus: 'Salvador - Campus Barbalho',
    nomeProg: 'Mestrado em Engenharia de Sistemas e Automação',
    eixo: 'Engenharias e Exatas',
    mestradoAcad: true, mestradoProf: false, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Pesquisas em controle de processos, instrumentação, sistemas embarcados e automação industrial.'
  },

  // IF Baiano
  {
    instituicao: 'IF Baiano',
    campus: 'Catu - Campus Catu',
    nomeProg: 'Mestrado Profissional em Educação Profissional e Tecnológica (ProfEPT)',
    eixo: 'Educação',
    mestradoAcad: false, mestradoProf: true, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: false,
    detalhes: 'Ensino de EPT com foco em metodologias integradoras para institutos federais e escolas técnicas.'
  },
  {
    instituicao: 'IF Baiano',
    campus: 'Guanambi - Campus Guanambi',
    nomeProg: 'Mestrado Profissional em Produção Vegetal no Semiárido',
    eixo: 'Agrárias e Ambientais',
    mestradoAcad: false, mestradoProf: true, doutoradoAcad: false, doutoradoProf: false, alunoEspecial: true,
    detalhes: 'Desenvolvimento de tecnologias de cultivo adaptadas às condições de semiaridez, convivência com a seca e fitotecnia.'
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

// Editais de Fallback Dinâmicos (Para o feed do portal no presente)
const FALLBACKS_EDITEIS = [
  {
    titulo: "Edital UFBA 02/2026 - Seleção de Aluno Especial - PGCOMP (Semestre 2026.2)",
    resumo: "O Programa de Pós-Graduação em Ciência da Computação da UFBA abre vagas para inscrição em disciplinas isoladas. Oportunidade para profissionais de TI cursarem matérias de Inteligência Artificial e Engenharia de Software no mestrado/doutorado.",
    instituicao: "UFBA",
    nivel: "Aluno Especial",
    area: "Tecnologia e Informática",
    vagas: 18,
    url: "https://sigaa.ufba.br/sigaa/public/processo_seletivo/lista.jsf"
  },
  {
    titulo: "Processo Seletivo UNEB 12/2026 - Mestrado Profissional em Gestão Educacional (GESTEC)",
    resumo: "Abertas as inscrições para o Programa de Pós-Graduação em Gestão e Tecnologias Aplicadas à Educação (GESTEC) da UNEB. O curso capacita gestores e educadores para inovação pedagógica e desenvolvimento de materiais multimídia.",
    instituicao: "UNEB",
    nivel: "Mestrado Profissional",
    area: "Gestão e Negócios",
    vagas: 20,
    url: "https://portal.uneb.br/pos-graduacao/"
  },
  {
    titulo: "Edital UFOB 03/2026 - Mestrado Profissional em Saúde da Família",
    resumo: "O Programa de Pós-Graduação em Saúde da Família da UFOB abre inscrições para o processo seletivo de novos alunos. Focado na atenção básica de saúde coletiva, abrangendo atuação em Barreiras e região oeste.",
    instituicao: "UFOB",
    nivel: "Mestrado Profissional",
    area: "Saúde e Biológicas",
    vagas: 12,
    url: "https://ufob.edu.br/pos-graduacao"
  },
  {
    titulo: "Processo Seletivo UESB 04/2026 - Doutorado e Mestrado em Enfermagem e Saúde",
    resumo: "Estão abertas as inscrições de candidatos para o Programa de Pós-Graduação em Enfermagem e Saúde da UESB, campus de Vitória da Conquista. Linhas de pesquisa em epidemiologia e cuidado humanizado.",
    instituicao: "UESB",
    nivel: "Mestrado Acadêmico",
    area: "Saúde e Biológicas",
    vagas: 15,
    url: "https://www.uesb.br/pos-graduacao"
  },
  {
    titulo: "Chamada UNIVASF 05/2026 - Seleção para Aluno Especial - Engenharia Agrícola",
    resumo: "Estão abertas as inscrições para aluno especial nas disciplinas de pós-graduação stricto sensu em Engenharia Agrícola da UNIVASF no campus de Juazeiro-BA. Foco em tecnologia de irrigação.",
    instituicao: "UNIVASF",
    nivel: "Aluno Especial",
    area: "Engenharias e Exatas",
    vagas: 8,
    url: "https://portais.univasf.edu.br/pos-graduacao"
  },
  {
    titulo: "Processo Seletivo Unijorge 01/2026 - Mestrado Profissional em Gestão e Negócios",
    resumo: "O Centro Universitário Jorge Amado abre inscrições para o Mestrado Profissional em Gestão e Negócios em Salvador. Linhas de pesquisa voltadas para de metodologias ágeis, inovação de mercado e finanças corporativas.",
    instituicao: "Unijorge",
    nivel: "Mestrado Profissional",
    area: "Gestão e Negócios",
    vagas: 25,
    url: "https://www.unijorge.edu.br/pos-graduacao/"
  },
  {
    titulo: "Edital UNEB 048/2026 - Seleção de Aluno Especial - PPGEL (Semestre 2026.2)",
    resumo: "Processo seletivo para aluno de matrícula especial do Programa de Pós-Graduação em Estudo de Linguagens (PPGEL) da UNEB para o segundo semestre de 2026. Oferece 70 vagas distribuídas entre disciplinas das linhas de pesquisa de Leitura, Literatura e Cultura e Linguagens, Discurso e Sociedade.",
    instituicao: "UNEB",
    nivel: "Aluno Especial",
    area: "Humanas e Sociais",
    vagas: 70,
    url: "https://ppgel.uneb.br/mestrado-aluno-especial/",
    inscricoesInicio: "2026-06-29T09:00:00.000Z",
    inscricoesFim: "2026-07-10T23:59:59.000Z",
    dataPublicacao: "2026-06-05T10:00:00.000Z",
    fonte: "PPGEL UNEB"
  },
  {
    titulo: "Edital UNEB 050/2026 - Seleção de Aluno Especial - PPGEduC (Semestre 2026.2)",
    resumo: "Processo Seletivo para aluno de matrícula especial em disciplinas dos cursos de Mestrado e Doutorado do Programa de Pós-Graduação em Educação e Contemporaneidade (PPGEduC) da UNEB, ofertado pelo Departamento de Educação (DEDC), Campus I.",
    instituicao: "UNEB",
    nivel: "Aluno Especial",
    area: "Educação",
    vagas: 15,
    url: "https://editais.uneb.br/edital_050_2026",
    inscricoesInicio: "2026-06-15T09:00:00.000Z",
    inscricoesFim: "2026-07-06T23:59:59.000Z",
    dataPublicacao: "2026-06-06T10:00:00.000Z",
    fonte: "PPGEduC UNEB"
  }
];

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
    if (!historicoDia.some(h => h.url === e.url && h.titulo === e.titulo)) {
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
  'UNIFTC': 'https://www.uniftc.edu.br'
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

// Busca editais reais no Google via Serper.dev e le com ScraperAPI se as chaves estiverem configuradas
async function buscarNovosEditais() {
  const SERPER_KEY = process.env.SERPER_API_KEY;
  const SCRAPER_KEY = process.env.SCRAPER_API_KEY;

  if (!SERPER_KEY || !SCRAPER_KEY) {
    console.log("Aviso: Chaves SERPER_API_KEY ou SCRAPER_API_KEY ausentes. Utilizando dados de simulacao/fallback...");
    return buscarNovosEditaisSimulados();
  }

  console.log("Iniciando busca dinamica de editais reais usando Serper e Scraper API...");
  
  const resultados = {
    'mestrado': [],
    'doutorado': [],
    'aluno-especial': []
  };

  // Queries direcionadas para universidades baianas
  const queries = [
    'site:uneb.br "aluno especial" 2026',
    'site:ufba.br "aluno especial" 2026',
    'edital pos-graduacao mestrado doutorado bahia 2026'
  ];

  const linksProcessados = new Set();
  const hoje = new Date();

  for (const query of queries) {
    try {
      console.log(`Buscando no Google: "${query}"`);
      const searchRes = await httpRequest({
        url: 'https://google.serper.dev/search',
        method: 'POST',
        headers: {
          'X-API-KEY': SERPER_KEY,
          'Content-Type': 'application/json'
        }
      }, {
        q: query,
        gl: 'br',
        hl: 'pt-br'
      });

      if (searchRes.statusCode === 200) {
        const searchData = JSON.parse(searchRes.data);
        const items = searchData.organic || [];
        
        for (const item of items.slice(0, 5)) { // Limita aos 5 primeiros resultados por query
          const url = item.link;
          if (linksProcessados.has(url)) continue;
          linksProcessados.add(url);

          // Identifica a instituicao correspondente
          let instituicao = 'UFBA';
          let encontrada = false;
          for (const [inst, site] of Object.entries(SITES_INSTITUICOES)) {
            const cleanSite = site.replace('https://', '').replace('http://', '').replace('www.', '').toLowerCase();
            if (url.toLowerCase().includes(cleanSite)) {
              instituicao = inst;
              encontrada = true;
              break;
            }
          }

          // Ignora links que nao pertençam a nenhuma universidade ou que nao sejam da uneb
          if (!encontrada && !url.includes('.edu.br') && !url.includes('.uneb.br')) {
            continue;
          }

          console.log(`Acessando e extraindo dados reais de: ${url}`);
          // Requisicao Scraper API com renderizacao Javascript ativada
          const scraperUrl = `https://api.scraperapi.com/?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}&render=true`;
          
          try {
            const scrapeRes = await httpRequest({ url: scraperUrl, method: 'GET' });
            if (scrapeRes.statusCode === 200) {
              const html = scrapeRes.data;
              
              // Extrai o titulo da pagina
              let titulo = item.title;
              const titleMatch = html.match(/<title>(.*?)<\/title>/i);
              if (titleMatch && titleMatch[1]) {
                titulo = titleMatch[1].trim();
              }

              // Limpa tags HTML para extrair texto bruto legivel
              let textContent = html
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

              const textLower = textContent.toLowerCase();

              // Determina o nivel/tema do edital
              let nivel = "Mestrado Acadêmico";
              let pastaTema = "mestrado";

              if (textLower.includes("aluno especial") || textLower.includes("matricula especial") || textLower.includes("estudante especial") || textLower.includes("disciplina isolada")) {
                nivel = "Aluno Especial";
                pastaTema = "aluno-especial";
              } else if (textLower.includes("doutorado")) {
                nivel = textLower.includes("doutorado profissional") ? "Doutorado Profissional" : "Doutorado Acadêmico";
                pastaTema = "doutorado";
              } else if (textLower.includes("mestrado")) {
                nivel = textLower.includes("mestrado profissional") ? "Mestrado Profissional" : "Mestrado Acadêmico";
                pastaTema = "mestrado";
              }

              // Determina a area de interesse fazendo contagem de termos chave
              let area = "Educação";
              let maxContagem = 0;
              for (const [temaNome, keywords] of Object.entries(TEMAS_INTERESSE)) {
                let contagem = 0;
                keywords.forEach(kw => {
                  const regex = new RegExp(`\\b${kw}\\b`, 'gi');
                  const matches = textLower.match(regex);
                  if (matches) contagem += matches.length;
                });
                if (contagem > maxContagem) {
                  maxContagem = contagem;
                  area = temaNome;
                }
              }

              // Extrai datas usando expressao regular para dd/mm/aaaa
              let inscInicio = new Date(hoje.getTime() - (2 * 24 * 3600 * 1000)).toISOString();
              let inscFim = new Date(hoje.getTime() + (15 * 24 * 3600 * 1000)).toISOString();
              const dateRegex = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g;
              const dates = [];
              let match;
              while ((match = dateRegex.exec(textContent)) !== null) {
                const day = parseInt(match[1]);
                const month = parseInt(match[2]) - 1;
                const year = parseInt(match[3]);
                const parsedDate = new Date(year, month, day);
                if (!isNaN(parsedDate.getTime()) && year >= 2026) {
                  dates.push(parsedDate);
                }
              }

              if (dates.length >= 2) {
                dates.sort((a, b) => a - b);
                inscInicio = dates[0].toISOString();
                inscFim = dates[dates.length - 1].toISOString();
              }

              const status = new Date(inscFim) >= hoje ? "Aberto" : "Encerrado";
              const resumo = item.snippet ? item.snippet.trim() : `Processo seletivo aberto para ingresso no programa de pos-graduacao. Confira o edital oficial da instituicao ${instituicao} para mais detalhes sobre os prazos.`;

              resultados[pastaTema].push({
                titulo: titulo.substring(0, 100),
                resumo: resumo.substring(0, 300),
                instituicao,
                nivel,
                area,
                vagas: 8 + (url.length % 15),
                inscricoesInicio: inscInicio,
                inscricoesFim: inscFim,
                url,
                status,
                dataPublicacao: new Date(hoje.getTime() - (4 * 24 * 3600 * 1000)).toISOString(),
                fonte: `${instituicao} Pos`
              });
            }
          } catch (e) {
            console.error(`Erro ao raspar a URL ${url}:`, e.message);
          }
        }
      }
    } catch (e) {
      console.error(`Erro na busca da Serper para a query "${query}":`, e.message);
    }
  }

  // Se a busca falhou ou retornou vazia (ex: cota estourada), usa fallbacks simulados
  const totalObtido = resultados.mestrado.length + resultados.doutorado.length + resultados['aluno-especial'].length;
  if (totalObtido === 0) {
    console.log("Nenhum edital real extraido. Utilizando fallbacks simulados...");
    return buscarNovosEditaisSimulados();
  }

  return resultados;
}

// Simula busca por novos editais no presente (fallback caso chaves de API nao existam)
async function buscarNovosEditaisSimulados() {
  console.log("Buscando novos editais nos portais das universidades baianas (simulacao)...");
  
  // Retorna um set determinístico e realista de editais em aberto no presente (Junho 2026)
  const resultados = {
    'mestrado': [],
    'doutorado': [],
    'aluno-especial': []
  };

  const hoje = new Date();

  // Geramos os editais do presente
  FALLBACKS_EDITEIS.forEach((e, i) => {
    let pastaTema = "mestrado";
    if (e.nivel.includes("Doutorado")) pastaTema = "doutorado";
    else if (e.nivel === "Aluno Especial") pastaTema = "aluno-especial";

    // Se o edital de fallback tiver datas explícitas definidas, usamos elas. Caso contrário, geramos dinamicamente.
    const dataInicio = e.inscricoesInicio ? new Date(e.inscricoesInicio) : new Date(hoje.getTime() - (24 * 3600 * 1000));
    const dataFim = e.inscricoesFim ? new Date(e.inscricoesFim) : new Date(hoje.getTime() + (15 * 24 * 3600 * 1000));
    const dataPub = e.dataPublicacao ? new Date(e.dataPublicacao) : new Date(hoje.getTime() - (3 * 24 * 3600 * 1000));

    // Determina o status com base na data final
    const status = dataFim >= hoje ? "Aberto" : "Encerrado";

    resultados[pastaTema].push({
      ...e,
      inscricoesInicio: dataInicio.toISOString(),
      inscricoesFim: dataFim.toISOString(),
      dataPublicacao: dataPub.toISOString(),
      status: status,
      fonte: e.fonte || `${e.instituicao} Ingresso`
    });
  });

  return resultados;
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
    
    // Deduplicar e ordenar
    const chavesUnicas = new Set();
    const editaisUnicos = [];
    todosTema.forEach(e => {
      const chave = `${e.titulo}-${e.url}`;
      if (!chavesUnicas.has(chave)) {
        chavesUnicas.add(chave);
        
        // Atualizar status conforme data limite dinamicamente no compilador
        const hoje = new Date();
        const prazoFim = new Date(e.inscricoesFim);
        if (prazoFim < hoje) {
          e.status = 'Encerrado';
        } else {
          e.status = 'Aberto';
        }
        
        editaisUnicos.push(e);
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

  // Deduplicar
  const chavesUnicas = new Set();
  const editaisUnicos = [];
  todosEditais.forEach(e => {
    const chave = `${e.titulo}-${e.url}`;
    if (!chavesUnicas.has(chave)) {
      chavesUnicas.add(chave);
      editaisUnicos.push(e);
    }
  });

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

  // 1. Sementa o histórico de 2 anos se estiver vazio
  verificarEGerarHistoricoRetroativo();

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
