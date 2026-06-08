import os
import re
import json
import html
import csv
import urllib.request
import urllib.parse
import ssl
from datetime import datetime, timedelta

# Helper para realizar requisições HTTP
def http_request(url, method='GET', headers=None, data=None):
    if headers is None:
        headers = {}
    
    req_data = None
    if data is not None:
        if isinstance(data, (dict, list)):
            req_data = json.dumps(data).encode('utf-8')
            if 'Content-Type' not in headers:
                headers['Content-Type'] = 'application/json'
        elif isinstance(data, str):
            req_data = data.encode('utf-8')
        else:
            req_data = data

    req = urllib.request.Request(url, method=method, headers=headers, data=req_data)
    
    # Ignora verificação SSL para portais que possam ter certificados inválidos/expirados
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as response:
            status_code = response.getcode()
            response_headers = dict(response.info())
            response_data = response.read().decode('utf-8', errors='ignore')
            return {
                'statusCode': status_code,
                'headers': response_headers,
                'data': response_data
            }
    except Exception as e:
        print(f"Erro na requisição HTTP para {url}: {e}")
        raise e

# Configurações e Feeds RSS
FEEDS_MONITORADOS = [
    { 'sigla': 'UFBA', 'url': 'https://www.ufba.br/rss.xml' },
    { 'sigla': 'UNEB', 'url': 'https://portal.uneb.br/feed/' },
    { 'sigla': 'UFRB', 'url': 'https://ufrb.edu.br/portal/noticias?format=feed&type=rss' },
    { 'sigla': 'IFBA', 'url': 'https://portal.ifba.edu.br/noticias/@@rss' }
]

TERMOS_EDITAL = [
    'edital', 'seleção', 'selecao', 'inscrições', 'inscricoes', 'processo seletivo', 
    'mestrado', 'doutorado', 'pós-graduação', 'pos-graduacao', 'aluno especial', 
    'aluno de matrícula especial', 'aluno de matricula especial', 'matrícula especial', 
    'matricula especial', 'estudante especial', 'aluno regular', 'disciplina isolada', 
    'disciplinas isoladas', 'vagas abertas', 'admissão', 'admissao'
]

TEMAS_INTERESSE = {
    'Educação': ['educação', 'educacao', 'pedagogia', 'ensino', 'didática', 'didatica', 'escola', 'currículo', 'curriculo', 'aprendizagem', 'professor', 'docente', 'licenciatura'],
    'Tecnologia e Informática': ['computação', 'computacao', 'informática', 'informatica', 'tecnologia da informação', 'tecnologia da informacao', 'ti', 'sistemas de informação', 'sistemas de informacao', 'ciência de dados', 'ciencia de dados', 'algoritmos', 'software', 'banco de dados', 'inteligência artificial', 'programação'],
    'Gestão e Negócios': ['administração', 'administracao', 'gestão', 'gestao', 'negócios', 'negocios', 'economia', 'finanças', 'financas', 'marketing', 'controladoria', 'empreendedorismo', 'recursos humanos', 'logística'],
    'Saúde e Biológicas': ['saúde', 'saude', 'medicina', 'enfermagem', 'nutrição', 'nutricao', 'odontologia', 'biologia', 'farmácia', 'farmacia', 'fisioterapia', 'psicologia', 'epidemiologia', 'saúde coletiva', 'saude coletiva'],
    'Humanas e Sociais': ['sociologia', 'filosofia', 'história', 'historia', 'direito', 'geografia', 'antropologia', 'ciência política', 'ciencia politica', 'serviço social', 'servico social', 'letras', 'linguística', 'linguistica'],
    'Comunicação e Artes': ['comunicação', 'comunicacao', 'jornalismo', 'mídia', 'midia', 'artes', 'música', 'musica', 'cinema', 'audiovisual', 'publicidade', 'propaganda', 'design'],
    'Engenharias e Exatas': ['engenharia', 'física', 'fisica', 'matemática', 'matematica', 'química', 'quimica', 'estatística', 'estatistica', 'arquitetura', 'urbanismo'],
    'Agrárias e Ambientais': ['agronomia', 'veterinária', 'veterinaria', 'zootecnia', 'meio ambiente', 'ambiental', 'ecologia', 'recursos naturais', 'irrigação', 'irrigaçao', 'sustentabilidade', 'agroecologia']
}

PROGRAMAS_REAIS = [
    {
        'instituicao': 'UFBA',
        'campus': 'Salvador - Campus Ondina',
        'nomeProg': 'Programa de Pós-Graduação em Educação (PPGE)',
        'eixo': 'Educação',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Focado em políticas educacionais, formação de professores, diversidade e gestão da educação.'
    },
    {
        'instituicao': 'UFBA',
        'campus': 'Salvador - Campus Ondina',
        'nomeProg': 'Programa de Pós-Graduação em Ciência da Computação (PGCOMP)',
        'eixo': 'Tecnologia e Informática',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Referência em engenharia de software, sistemas distribuídos, inteligência artificial e computação aplicada.'
    },
    {
        'instituicao': 'UFBA',
        'campus': 'Salvador - Campus Ondina',
        'nomeProg': 'Pós-Graduação em Comunicação e Cultura Contemporâneas (PósCom)',
        'eixo': 'Comunicação e Artes',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Estudos em cibercultura, mídias digitais, jornalismo contemporâneo e economia política da comunicação.'
    },
    {
        'instituicao': 'UFBA',
        'campus': 'Salvador - Campus Canela',
        'nomeProg': 'Programa de Pós-Graduação em Saúde Coletiva (PPGSC)',
        'eixo': 'Saúde e Biológicas',
        'mestradoAcad': True, 'mestradoProf': True, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Estudos epidemiológicos, políticas de saúde, ciências sociais em saúde e planejamento de serviços de saúde.'
    },
    {
        'instituicao': 'UFBA',
        'campus': 'Salvador - Campus Canela',
        'nomeProg': 'Programa de Pós-Graduação em Administração (NPGA)',
        'eixo': 'Gestão e Negócios',
        'mestradoAcad': True, 'mestradoProf': True, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Pesquisas em organizações, finanças corporativas, estratégia, marketing e gestão pública.'
    },
    {
        'instituicao': 'UFBA',
        'campus': 'Salvador - Campus Federação',
        'nomeProg': 'Programa de Pós-Graduação em Engenharia Industrial (PEI)',
        'eixo': 'Engenharias e Exatas',
        'mestradoAcad': True, 'mestradoProf': True, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Otimização de processos, engenharia de segurança, inteligência industrial e eficiência energética.'
    },
    {
        'instituicao': 'UNEB',
        'campus': 'Salvador - Campus I',
        'nomeProg': 'Mestrado Profissional em Educação de Jovens e Adultos (MPEJA)',
        'eixo': 'Educação',
        'mestradoAcad': False, 'mestradoProf': True, 'doutoradoAcad': False, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Focado em políticas de inclusão, metodologias ativas e materiais didáticos para EJA.'
    },
    {
        'instituicao': 'UNEB',
        'campus': 'Salvador - Campus I',
        'nomeProg': 'Programa de Pós-Graduação em Gestão e Tecnologias Aplicadas à Educação (GESTEC)',
        'eixo': 'Gestão e Negócios',
        'mestradoAcad': False, 'mestradoProf': True, 'doutoradoAcad': False, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Estudos de gestão educacional, produção de materiais multimídia e tecnologias aplicadas ao ensino.'
    },
    {
        'instituicao': 'UNEB',
        'campus': 'Salvador - Campus I',
        'nomeProg': 'Programa de Pós-Graduação em Estudos Linguísticos (PPGEL)',
        'eixo': 'Humanas e Sociais',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Pesquisas em análise do discurso, linguística aplicada, variação linguística e sociolinguística.'
    },
    {
        'instituicao': 'UNEB',
        'campus': 'Salvador - Campus I',
        'nomeProg': 'Programa de Pós-Graduação em Educação e Contemporaneidade (PPGEduC)',
        'eixo': 'Educação',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Estudos avançados em educação e contemporaneidade, políticas públicas educacionais e movimentos sociais.'
    },
    {
        'instituicao': 'UFRB',
        'campus': 'Amargosa - Centro de Formação de Professores',
        'nomeProg': 'Programa de Pós-Graduação em Educação do Campo (PPGEC)',
        'eixo': 'Educação',
        'mestradoAcad': False, 'mestradoProf': True, 'doutoradoAcad': False, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Voltado para a realidade das escolas do campo, movimentos sociais e práticas pedagógicas interdisciplinares.'
    },
    {
        'instituicao': 'UFRB',
        'campus': 'Cruz das Almas - Campus Universitário',
        'nomeProg': 'Programa de Pós-Graduação em Engenharia Agrícola (PPGEA)',
        'eixo': 'Agrárias e Ambientais',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Foco em engenharia de água e solo, mecanização agrícola, processamento de produtos agrícolas e irrigação.'
    },
    {
        'instituicao': 'UFRB',
        'campus': 'Cruz das Almas - Campus Universitário',
        'nomeProg': 'Mestrado em Comunicação e Interculturalidade',
        'eixo': 'Comunicação e Artes',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': False, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Estudos sobre manifestações populares, comunicação regional, fluxos identitários e interculturalidade.'
    },
    {
        'instituicao': 'IFBA',
        'campus': 'Salvador - Geral',
        'nomeProg': 'Mestrado Profissional em Educação Profissional e Tecnológica (ProfEPT)',
        'eixo': 'Educação',
        'mestradoAcad': False, 'mestradoProf': True, 'doutoradoAcad': False, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Formação na área de educação profissional e tecnológica integrando práticas pedagógicas e pesquisa aplicada.'
    },
    {
        'instituicao': 'IFBA',
        'campus': 'Salvador - Campus Salvador',
        'nomeProg': 'Mestrado Profissional em Engenharia de Sistemas e Produtos (PPGESP)',
        'eixo': 'Engenharias e Exatas',
        'mestradoAcad': False, 'mestradoProf': True, 'doutoradoAcad': False, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Desenvolvimento de tecnologias em sistemas embarcados, engenharia de software e controle de produtos.'
    },
    {
        'instituicao': 'IFBA',
        'campus': 'Salvador - Campus Salvador',
        'nomeProg': 'Mestrado Profissional em Engenharia de Materiais (PPGEM)',
        'eixo': 'Engenharias e Exatas',
        'mestradoAcad': False, 'mestradoProf': True, 'doutoradoAcad': False, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Pesquisa e desenvolvimento de materiais metálicos, cerâmicos e polímeros aplicados à indústria.'
    },
    {
        'instituicao': 'IFBA',
        'campus': 'Camaçari - Campus Camaçari',
        'nomeProg': 'Mestrado Profissional em Propriedade Intelectual e Transferência de Tecnologia (PROFNIT)',
        'eixo': 'Gestão e Negócios',
        'mestradoAcad': False, 'mestradoProf': True, 'doutoradoAcad': False, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Foco em propriedade intelectual, transferência de tecnologia e proteção de patentes para inovação.'
    },
    {
        'instituicao': 'IF Baiano',
        'campus': 'Serrinha - Campus Serrinha',
        'nomeProg': 'Mestrado Profissional em Ciências Ambientais (MPCA)',
        'eixo': 'Agrárias e Ambientais',
        'mestradoAcad': False, 'mestradoProf': True, 'doutoradoAcad': False, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Estudos sobre impacto ambiental, conservação de ecossistemas no semiárido e recursos hídricos.'
    },
    {
        'instituicao': 'IF Baiano',
        'campus': 'Guanambi - Campus Guanambi',
        'nomeProg': 'Mestrado Profissional em Produção Vegetal no Semiárido (PPGPV)',
        'eixo': 'Agrárias e Ambientais',
        'mestradoAcad': False, 'mestradoProf': True, 'doutoradoAcad': False, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Tecnologias de cultivo adaptadas às condições de semiaridez, convivência com a seca e fitotecnia regional.'
    },
    {
        'instituicao': 'IF Baiano',
        'campus': 'Catu - Campus Catu',
        'nomeProg': 'Mestrado Profissional em Educação Profissional e Tecnológica (ProfEPT)',
        'eixo': 'Educação',
        'mestradoAcad': False, 'mestradoProf': True, 'doutoradoAcad': False, 'doutoradoProf': False, 'alunoEspecial': False,
        'detalhes': 'Formação e desenvolvimento de práticas educativas voltadas para a educação profissional nos institutos federais.'
    },
    {
        'instituicao': 'IF Baiano',
        'campus': 'Valença - Campus Valença',
        'nomeProg': 'Doutorado Interinstitucional em Extensão Rural (DINTER)',
        'eixo': 'Agrárias e Ambientais',
        'mestradoAcad': False, 'mestradoProf': False, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': False,
        'detalhes': 'Doutorado interinstitucional com foco em desenvolvimento rural, extensão agrícola e políticas para o semiárido.'
    },
    {
        'instituicao': 'UEFS',
        'campus': 'Feira de Santana - Campus Universitário',
        'nomeProg': 'Programa de Pós-Graduação em Educação (PPGEdu)',
        'eixo': 'Educação',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Foco na formação continuada de educadores, práticas escolares e sociologia da educação.'
    },
    {
        'instituicao': 'UEFS',
        'campus': 'Feira de Santana - Campus Universitário',
        'nomeProg': 'Mestrado em Biotecnologia',
        'eixo': 'Saúde e Biológicas',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Pesquisas aplicadas em recursos genéticos, caracterização molecular, bioativos vegetais e bioprocessos.'
    },
    {
        'instituicao': 'UESC',
        'campus': 'Ilhéus - Campus Soane Nazaré de Alencar',
        'nomeProg': 'Mestrado em Ciência da Computação (PPGCOMP)',
        'eixo': 'Tecnologia e Informática',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': False, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Modelagem computacional, otimização de sistemas, inteligência artificial e internet das coisas.'
    },
    {
        'instituicao': 'UESC',
        'campus': 'Ilhéus - Campus Soane Nazaré de Alencar',
        'nomeProg': 'Programa de Pós-Graduação em Produção Vegetal',
        'eixo': 'Agrárias e Ambientais',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Estudos de fitotecnia, melhoramento de plantas tropicais (cacau), entomologia agrícola e solo.'
    },
    {
        'instituicao': 'UFSB',
        'campus': 'Porto Seguro - Campus Sosígenes Costa',
        'nomeProg': 'Programa de Pós-Graduação em Ciências Sociais',
        'eixo': 'Humanas e Sociais',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Pesquisas em dinâmicas culturais, desigualdade social, direitos humanos e cidadania no sul da Bahia.'
    },
    {
        'instituicao': 'UFSB',
        'campus': 'Itabuna - Campus Jorge Amado',
        'nomeProg': 'Programa de Pós-Graduação em Biossistemas',
        'eixo': 'Saúde e Biológicas',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': False, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Estudos de biodiversidade, interações ecológicas, fisiologia animal/vegetal e biologia integrativa.'
    },
    {
        'instituicao': 'UFOB',
        'campus': 'Barreiras - Campus Reitor Edgard Santos',
        'nomeProg': 'Programa de Pós-Graduação em Ciências Ambientais',
        'eixo': 'Agrárias e Ambientais',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': False, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Políticas de conservação do Cerrado, recursos hídricos, impactos da expansão agrícola no oeste baiano.'
    },
    {
        'instituicao': 'UFOB',
        'campus': 'Barreiras - Campus Reitor Edgard Santos',
        'nomeProg': 'Mestrado Profissional em Saúde da Família',
        'eixo': 'Saúde e Biológicas',
        'mestradoAcad': False, 'mestradoProf': True, 'doutoradoAcad': False, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Estratégia de Saúde da Família, atenção básica no SUS, saúde coletiva e intervenção comunitária.'
    },
    {
        'instituicao': 'UESB',
        'campus': 'Vitória da Conquista - Campus Universitário',
        'nomeProg': 'Programa de Pós-Graduação em Enfermagem e Saúde',
        'eixo': 'Saúde e Biológicas',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Assistência de enfermagem, vigilância epidemiológica, políticas de saúde pública e cuidado humanizado.'
    },
    {
        'instituicao': 'UESB',
        'campus': 'Itapetinga - Campus Universitário',
        'nomeProg': 'Programa de Pós-Graduação em Zootecnia',
        'eixo': 'Agrárias e Ambientais',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Produção e nutrição de ruminantes, forragicultura, melhoramento genético animal no semiárido.'
    },
    {
        'instituicao': 'UNIVASF',
        'campus': 'Juazeiro - Campus Juazeiro',
        'nomeProg': 'Programa de Pós-Graduação em Engenharia Agrícola',
        'eixo': 'Engenharias e Exatas',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Tecnologia de irrigação, recursos de água e solo, construções rurais no vale do submédio São Francisco.'
    },
    {
        'instituicao': 'UNIFACS',
        'campus': 'Salvador - Campus Tancredo Neves',
        'nomeProg': 'Programa de Pós-Graduação em Sistemas e Computação (PPGSC)',
        'eixo': 'Tecnologia e Informática',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': False, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Desenvolvimento de sistemas computacionais, redes de computadores, internet das coisas e IA aplicada.'
    },
    {
        'instituicao': 'UNIFACS',
        'campus': 'Salvador - Campus Tancredo Neves',
        'nomeProg': 'Programa de Pós-Graduação em Administração (PPGA)',
        'eixo': 'Gestão e Negócios',
        'mestradoAcad': True, 'mestradoProf': True, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Inovação e competitividade, finanças de mercado, gestão estratégica de pessoas e sustentabilidade organizacional.'
    },
    {
        'instituicao': 'UCSal',
        'campus': 'Salvador - Campus Pituaçu',
        'nomeProg': 'Programa de Pós-Graduação em Políticas Sociais e Cidadania',
        'eixo': 'Humanas e Sociais',
        'mestradoAcad': True, 'mestradoProf': False, 'doutoradoAcad': True, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Direitos sociais, políticas públicas de combate à pobreza, movimentos comunitários e cidadania urbana.'
    },
    {
        'instituicao': 'Unijorge',
        'campus': 'Salvador - Campus Paralela',
        'nomeProg': 'Mestrado Profissional em Gestão e Negócios',
        'eixo': 'Gestão e Negócios',
        'mestradoAcad': False, 'mestradoProf': True, 'doutoradoAcad': False, 'doutoradoProf': False, 'alunoEspecial': True,
        'detalhes': 'Metodologias ágeis, inovação corporativa, desenvolvimento local, finanças de negócios e mercado baiano.'
    }
]

FALLBACKS_EDITEIS = []


SITES_INSTITUICOES = {
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
}

NOMES_MESES = [
    'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]

# Cria diretórios recursivamente de forma segura
def criar_diretorio_robustamente(dir_path):
    os.makedirs(dir_path, exist_ok=True)

# Salva histórico mensal em formato JSON e CSV
def salvar_historico_edital(tema, editais, data_especifica=None):
    if not editais:
        return

    ref_date = data_especifica or datetime.now()
    ano = str(ref_date.year)
    mes_num = str(ref_date.month).zfill(2)
    nome_mes = NOMES_MESES[ref_date.month - 1]

    dir_path = os.path.join(os.path.dirname(__file__), 'DATA', ano, mes_num)
    criar_diretorio_robustamente(dir_path)

    csv_path = os.path.join(dir_path, f"{tema}-{nome_mes}-{ano}.csv")
    json_path = os.path.join(dir_path, f"{tema}-{nome_mes}-{ano}.json")

    # 1. Gravar/Concatenar CSV
    escrever_cabecalho = not os.path.exists(csv_path)
    data_coleta = ref_date.isoformat() + 'Z'

    with open(csv_path, 'a', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        if escrever_cabecalho:
            writer.writerow(['data_coleta', 'titulo', 'resumo', 'instituicao', 'nivel', 'area', 'vagas', 'inscricoes_inicio', 'inscricoes_fim', 'url', 'status', 'data_publicacao', 'fonte'])
        
        for e in editais:
            writer.writerow([
                data_coleta, e['titulo'], e['resumo'], e['instituicao'], e['nivel'], e['area'], 
                e['vagas'], e['inscricoesInicio'], e['inscricoesFim'], e['url'], e['status'], 
                e['dataPublicacao'], e['fonte']
            ])

    # 2. Gravar/Atualizar JSON
    historico_dia = []
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                historico_dia = json.load(f)
        except Exception:
            historico_dia = []

    for e in editais:
        index = next((i for i, h in enumerate(historico_dia) if h['url'] == e['url'] and h['titulo'] == e['titulo']), -1)
        if index != -1:
            existente = historico_dia[index]
            # Prorrogação detectada
            if e['inscricoesFim'] > existente['inscricoesFim']:
                print(f"[Prorrogação] Atualizando prazo do edital: \"{e['titulo']}\" de {existente['inscricoesFim']} para {e['inscricoesFim']}")
                historico_dia[index] = {
                    **existente,
                    'resumo': e['resumo'],
                    'vagas': e['vagas'],
                    'inscricoesInicio': e['inscricoesInicio'],
                    'inscricoesFim': e['inscricoesFim'],
                    'status': e['status'],
                    'dataPublicacao': e['dataPublicacao'],
                    'fonte': e['fonte']
                }
        else:
            historico_dia.append({
                'dataColeta': data_coleta,
                'titulo': e['titulo'],
                'resumo': e['resumo'],
                'instituicao': e['instituicao'],
                'nivel': e['nivel'],
                'area': e['area'],
                'vagas': e['vagas'],
                'inscricoesInicio': e['inscricoesInicio'],
                'inscricoesFim': e['inscricoesFim'],
                'url': e['url'],
                'status': e['status'],
                'dataPublicacao': e['dataPublicacao'],
                'fonte': e['fonte']
            })

    # Ordenar por publicação decrescente
    historico_dia.sort(key=lambda x: x['dataPublicacao'], reverse=True)
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(historico_dia, f, ensure_ascii=False, indent=2)


# Busca recursiva de arquivos JSON nas pastas dos meses
def buscar_arquivos_json(directory, files_list=None):
    if files_list is None:
        files_list = []
    if not os.path.exists(directory):
        return files_list
    
    for item in os.listdir(directory):
        full_path = os.path.join(directory, item)
        if os.path.isdir(full_path):
            parent_dir = os.path.basename(directory)
            is_year_dir = bool(re.match(r'^\d{4}$', parent_dir))
            # Só entra em subpastas de meses (2 dígitos) se estiver no diretório do ano
            if is_year_dir and not re.match(r'^\d{2}$', item):
                continue
            buscar_arquivos_json(full_path, files_list)
        elif item.endswith('.json'):
            parent_dir = os.path.basename(directory)
            is_year_dir = bool(re.match(r'^\d{4}$', parent_dir))
            # Ignora JSONs consolidados na raiz do ano
            if is_year_dir:
                continue
            files_list.append(full_path)
    return files_list


# Consolida ano letivo e gera arquivos mestrado.json/csv, etc.
def consolidar_ano(ano):
    ano_dir = os.path.join(os.path.dirname(__file__), 'DATA', str(ano))
    if not os.path.exists(ano_dir):
        return

    meses = [m for m in os.listdir(ano_dir) if re.match(r'^\d{2}$', m) and os.path.isdir(os.path.join(ano_dir, m))]

    for tema in ['mestrado', 'doutorado', 'aluno-especial']:
        todos_tema = []
        for mes in meses:
            nome_mes = NOMES_MESES[int(mes) - 1]
            json_path = os.path.join(ano_dir, mes, f"{tema}-{nome_mes}-{ano}.json")
            if os.path.exists(json_path):
                try:
                    with open(json_path, 'r', encoding='utf-8') as f:
                        content = json.load(f)
                        if isinstance(content, list):
                            todos_tema.extend(content)
                except Exception as e:
                    print(f"Erro ao ler arquivo {json_path} para consolidação anual: {e}")

        # Deduplicar mantendo o de maior prazo
        mapa_editais = {}
        for e in todos_tema:
            chave = f"{e['titulo']}-{e['url']}"
            if chave not in mapa_editais:
                mapa_editais[chave] = e
            else:
                existente = mapa_editais[chave]
                if e['inscricoesFim'] > existente['inscricoesFim']:
                    mapa_editais[chave] = e

        editais_unicos = list(mapa_editais.values())
        hoje_iso = datetime.now().isoformat() + 'Z'

        for e in editais_unicos:
            # Atualiza status conforme prazo final
            if e['inscricoesFim'] < hoje_iso:
                e['status'] = 'Encerrado'
            else:
                e['status'] = 'Aberto'

        editais_unicos.sort(key=lambda x: x['dataPublicacao'], reverse=True)

        # Gravar JSON anual
        output_json_path = os.path.join(ano_dir, f"{tema}.json")
        with open(output_json_path, 'w', encoding='utf-8') as f:
            json.dump(editais_unicos, f, ensure_ascii=False, indent=2)

        # Gravar CSV anual
        output_csv_path = os.path.join(ano_dir, f"{tema}.csv")
        with open(output_csv_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['data_coleta', 'titulo', 'resumo', 'instituicao', 'nivel', 'area', 'vagas', 'inscricoes_inicio', 'inscricoes_fim', 'url', 'status', 'data_publicacao', 'fonte'])
            for e in editais_unicos:
                writer.writerow([
                    e.get('dataColeta', hoje_iso), e['titulo'], e['resumo'], e['instituicao'], e['nivel'], e['area'], 
                    e['vagas'], e['inscricoesInicio'], e['inscricoesFim'], e['url'], e['status'], 
                    e['dataPublicacao'], e['fonte']
                ])


# Consolida todos os anos da pasta DATA
def consolidar_todos_anos():
    print("Consolidando arquivos históricos anuais...")
    data_dir = os.path.join(os.path.dirname(__file__), 'DATA')
    if not os.path.exists(data_dir):
        return
    anos = [a for a in os.listdir(data_dir) if re.match(r'^\d{4}$', a) and os.path.isdir(os.path.join(data_dir, a))]
    for ano in anos:
        consolidar_ano(ano)
    print("Consolidação anual concluída!")


# Gera o arquivo metricas.json contendo indicadores consolidados
def gerar_metricas():
    print("Compilando estatísticas e métricas de editais...")
    data_dir_path = os.path.join(os.path.dirname(__file__), 'DATA')
    json_files = buscar_arquivos_json(data_dir_path)

    todos_editais = []
    for file in json_files:
        try:
            with open(file, 'r', encoding='utf-8') as f:
                content = json.load(f)
                if isinstance(content, list):
                    todos_editais.extend(content)
        except Exception as e:
            print(f"Erro ao ler arquivo para métricas: {file} - {e}")

    # Deduplicar
    chaves_unicas = set()
    editais_unicos = []
    for e in todos_editais:
        chave = f"{e['titulo']}-{e['url']}"
        if chave not in chaves_unicas:
            chaves_unicas.add(chave)
            editais_unicos.append(e)

    total_geral = len(editais_unicos)

    totais_niveis = {
        'Mestrado Acadêmico': 0,
        'Mestrado Profissional': 0,
        'Doutorado Acadêmico': 0,
        'Doutorado Profissional': 0,
        'Aluno Especial': 0
    }

    totais_areas = {a: 0 for a in TEMAS_INTERESSE.keys()}
    contagem_instituicoes = {}
    contagem_status = { 'Aberto': 0, 'Encerrado': 0, 'Em andamento': 0 }

    for e in editais_unicos:
        if e['nivel'] in totais_niveis:
            totais_niveis[e['nivel']] += 1
        if e['area'] in totais_areas:
            totais_areas[e['area']] += 1
        if e['status'] in contagem_status:
            contagem_status[e['status']] += 1
        
        contagem_instituicoes[e['instituicao']] = contagem_instituicoes.get(e['instituicao'], 0) + 1

    ranking_inst = [
        { 'nome': nome, 'total': total } 
        for nome, total in sorted(contagem_instituicoes.items(), key=lambda x: x[1], reverse=True)
    ]

    metricas = {
        'geradoEm': datetime.now().isoformat() + 'Z',
        'totalGeral': total_geral,
        'totaisNiveis': totais_niveis,
        'totaisAreas': totais_areas,
        'status': contagem_status,
        'porInstituicao': ranking_inst
    }

    metricas_path = os.path.join(os.path.dirname(__file__), 'metricas.json')
    with open(metricas_path, 'w', encoding='utf-8') as f:
        json.dump(metricas, f, ensure_ascii=False, indent=2)
    print(f"Métricas consolidadas salvas em: {metricas_path}")


# Gera o arquivo ultimos-editais.json contendo editais que continuam abertos
def gerar_ultimos_editais():
    print("Gerando arquivo de editais abertos (ultimos-editais.json)...")
    data_dir_path = os.path.join(os.path.dirname(__file__), 'DATA')
    json_files = buscar_arquivos_json(data_dir_path)

    todos_editais = []
    for file in json_files:
        try:
            with open(file, 'r', encoding='utf-8') as f:
                content = json.load(f)
                if isinstance(content, list):
                    todos_editais.extend(content)
        except Exception as e:
            print(f"Erro ao ler arquivo para ultimos-editais: {file} - {e}")

    # Deduplicar mantendo o prazo final mais longo
    mapa_editais = {}
    for e in todos_editais:
        chave = f"{e['titulo']}-{e['url']}"
        if chave not in mapa_editais:
            mapa_editais[chave] = e
        else:
            existente = mapa_editais[chave]
            if e['inscricoesFim'] > existente['inscricoesFim']:
                mapa_editais[chave] = e

    editais_unicos = list(mapa_editais.values())
    hoje = datetime.now()

    # Filtrar apenas os abertos (prazo final >= hoje)
    editais_abertos = []
    for e in editais_unicos:
        # Remover sufixo 'Z' ou milissegundos para converter para data do Python
        fim_clean = e['inscricoesFim'].split('.')[0].replace('Z', '')
        try:
            prazo_fim = datetime.fromisoformat(fim_clean)
            if prazo_fim >= hoje:
                e['status'] = 'Aberto'
                editais_abertos.append(e)
        except Exception:
            # Se falhar no parse, mantém se for no futuro assumido
            e['status'] = 'Aberto'
            editais_abertos.append(e)

    # Ordenar por publicação decrescente
    editais_abertos.sort(key=lambda x: x['dataPublicacao'], reverse=True)

    ultimos_editais_path = os.path.join(os.path.dirname(__file__), 'ultimos-editais.json')
    with open(ultimos_editais_path, 'w', encoding='utf-8') as f:
        json.dump({
            'ultimaAtualizacao': hoje.isoformat() + 'Z',
            'editais': editais_abertos
        }, f, ensure_ascii=False, indent=2)

    print(f"Salvos {len(editais_abertos)} editais abertos em {ultimos_editais_path}")


# Helper para extrair período de inscrição (ex: "01/06/2026 a 30/06/2026")
def parse_periodo(periodo_str):
    p_clean = periodo_str.replace('\xa0', ' ').replace('\u00a0', ' ').replace('&nbsp;', ' ').strip()
    parts = re.split(r'\s+(?:a|à|-)\s+|\s*-\s*', p_clean, flags=re.IGNORECASE)
    hoje = datetime.now()
    start = hoje
    end = hoje

    def parse_date(d_str):
        matches = re.search(r'(\d{2})/(\d{2})/(\d{4})', d_str)
        if matches:
            day = int(matches.group(1))
            month = int(matches.group(2))
            year = int(matches.group(3))
            return datetime(year, month, day, 12, 0, 0)
        return hoje

    if len(parts) >= 2:
        start = parse_date(parts[0])
        end = parse_date(parts[1])
    elif len(parts) == 1:
        start = parse_date(parts[0])
        end = start
    return start, end


# ══ RASPADOR DIRETO E INTEGRADO DO SIGAA ══
def raspar_sigaa_portal_direct(sigla, url):
    print(f"[{sigla} SIGAA] Buscando processos seletivos diretamente de: {url}")
    
    editais_encontrados = []
    hoje = datetime.now()
    
    try:
        response = http_request(
            url, 
            method='GET', 
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        )

        if response['statusCode'] != 200:
            print(f"[{sigla} SIGAA] Erro ao acessar. Status: {response['statusCode']}")
            return []

        html_content = response['data']
        tr_regex = re.compile(r'<tr\b[^>]*>([\s\S]*?)<\/tr>', re.IGNORECASE)
        current_edital = ''
        
        for tr_match in tr_regex.finditer(html_content):
            tr_content = tr_match.group(1)
            agrupador_match = ('class="agrupador"' in tr_content or 'class=\'agrupador\'' in tr_content or 
                               'colspan="4"' in tr_content or 'colspan="5"' in tr_content or 
                               'colspan=\'4\'' in tr_content or 'colspan=\'5\'' in tr_content)
            
            if agrupador_match:
                clean_text = re.sub(r'<[^>]*>', ' ', tr_content)
                clean_text = re.sub(r'\s+', ' ', clean_text).strip()
                clean_text = html.unescape(clean_text)
                if clean_text:
                    current_edital = clean_text
                continue
            
            td_regex = re.compile(r'<td\b[^>]*>([\s\S]*?)<\/td>', re.IGNORECASE)
            tds = []
            for td_match in td_regex.finditer(tr_content):
                clean_td = re.sub(r'<[^>]*>', ' ', td_match.group(1))
                clean_td = re.sub(r'\s+', ' ', clean_td).strip()
                tds.append(clean_td)
            
            if len(tds) >= 3:
                has_date_range = any(re.search(r'\d{2}/\d{2}/\d{4}', td) for td in tds)
                if has_date_range:
                    course = html.unescape(tds[0])
                    vacancies_raw = tds[1]
                    period_raw = tds[2]
                    
                    edital_nome = current_edital if current_edital else f"Processo Seletivo {sigla}"
                    start_dt, end_dt = parse_periodo(period_raw)
                    
                    # Filtra editais encerrados antes de Junho/2026 (início do histórico)
                    limite_historico = datetime(2026, 6, 1, 0, 0, 0)
                    if end_dt < limite_historico:
                        continue
                    
                    vagas = 10
                    try:
                        vagas = int(vacancies_raw)
                    except Exception:
                        pass
                        
                    status = "Aberto" if end_dt >= hoje else "Encerrado"
                    
                    nivel = "Mestrado Acadêmico"
                    pasta_tema = "mestrado"
                    combined_lower = f"{edital_nome} {course}".lower()
                    
                    aluno_especial_terms = ["aluno especial", "matricula especial", "matrícula especial", "estudante especial", "disciplina isolada", "disciplinas isoladas", "vaga isolada", "vagas isoladas", "estudante isolado"]
                    if any(x in combined_lower for x in aluno_especial_terms):
                        nivel = "Aluno Especial"
                        pasta_tema = "aluno-especial"
                    elif "doutorado" in combined_lower:
                        nivel = "Doutorado Profissional" if "profissional" in combined_lower else "Doutorado Acadêmico"
                        pasta_tema = "doutorado"
                    elif "mestrado" in combined_lower:
                        nivel = "Mestrado Profissional" if "profissional" in combined_lower else "Mestrado Acadêmico"
                        pasta_tema = "mestrado"
                    
                    area = "Saúde e Biológicas"
                    max_contagem = 0
                    for tema_nome, keywords in TEMAS_INTERESSE.items():
                        contagem = sum(len(re.findall(r'\b' + re.escape(kw) + r'\b', combined_lower)) for kw in keywords)
                        if contagem > max_contagem:
                            max_contagem = contagem
                            area = tema_nome
                    
                    titulo_edital = f"{edital_nome} - {course}"
                    resumo_edital = f"Inscrições abertas para o processo seletivo da {sigla} de ingresso no curso: {course}. Vagas ofertadas: {vagas}. Período de inscrições de {period_raw}. Consulte o edital completo no portal oficial da instituição."
                    
                    editais_encontrados.append({
                        'titulo': titulo_edital[:150],
                        'resumo': resumo_edital[:350],
                        'instituicao': sigla,
                        'nivel': nivel,
                        'area': area,
                        'vagas': vagas,
                        'inscricoesInicio': start_dt.isoformat() + 'Z',
                        'inscricoesFim': end_dt.isoformat() + 'Z',
                        'url': url,
                        'status': status,
                        'dataPublicacao': start_dt.isoformat() + 'Z',
                        'fonte': f"{sigla} SIGAA"
                    })
    except Exception as e:
        print(f"[{sigla} SIGAA] Falha na raspagem direta: {e}")
    
    return editais_encontrados


# Função para identificar e filtrar caminhos genéricos de portais (landing pages)
def eh_url_generica(url):
    parsed = urllib.parse.urlparse(url)
    path = parsed.path.lower().strip('/')
    
    # Se o caminho for vazio, é a página principal da instituição
    if not path:
        return True
        
    # Caminhos de landing pages típicas que listam cursos/notícias mas não são editais específicos
    caminhos_genericos = {
        'pos-graduacao', 'pos_graduacao', 'posgraduacao',
        'ingresso', 'ingresso-de-estudantes', 'ingresso-de-estudantes/pos-graduacao',
        'cursos', 'cursos/pos-graduacao', 'cursos/pos_graduacao',
        'editais', 'editais/pos-graduacao',
        'prosel', 'portal/prosel',
        'prosis/processos-seletivos/pos-graduacao',
        'portal', 'portal/pos-graduacao',
        'noticias', 'noticias/@@rss'
    }
    
    if path in caminhos_genericos:
        return True
        
    for cg in caminhos_genericos:
        if path.endswith(cg):
            return True
            
    return False


# Busca novos editais nos portais SIGAA (raspagem direta de fontes oficiais)
def buscar_novos_editais():
    print("Iniciando busca direta e em tempo real nos portais SIGAA (UFBA, UFRB, UFSB, UFOB, UNILAB)...")
    
    resultados = {
        'mestrado': [],
        'doutorado': [],
        'aluno-especial': []
    }

    sigaa_portais = [
        { 'sigla': 'UFBA', 'url': 'https://sigaa.ufba.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=S' },
        { 'sigla': 'UFRB', 'url': 'https://sistemas.ufrb.edu.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=S' },
        { 'sigla': 'UFSB', 'url': 'https://sig.ufsb.edu.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=S' },
        { 'sigla': 'UFOB', 'url': 'https://sig.ufob.edu.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=S' },
        { 'sigla': 'UNILAB', 'url': 'https://sigaa.unilab.edu.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=S' }
    ]
    
    for portal in sigaa_portais:
        try:
            portal_editais = raspar_sigaa_portal_direct(portal['sigla'], portal['url'])
            print(f"[{portal['sigla']} SIGAA] Encontrados {len(portal_editais)} editais reais.")
            for ed in portal_editais:
                pasta = "mestrado"
                if ed['nivel'] == "Aluno Especial":
                    pasta = "aluno-especial"
                elif ed['nivel'].startswith("Doutorado"):
                    pasta = "doutorado"
                
                ja_existe = any(x['titulo'] == ed['titulo'] for x in resultados[pasta])
                if not ja_existe:
                    resultados[pasta].append(ed)
        except Exception as e:
            print(f"Erro ao raspar SIGAA {portal['sigla']} diretamente: {e}")

    return resultados


# Simulação de busca com dados de fallbacks
def buscar_novos_editais_simulados():
    print("Simulação desativada. Retornando dados vazios.")
    return {
        'mestrado': [],
        'doutorado': [],
        'aluno-especial': []
    }



# Execução Principal do Compilador
def executar_compilador():
    print(f"--- Iniciando Compilador de Editais da Bahia (Python) ({datetime.now().strftime('%d/%m/%Y, %H:%M:%S')}) ---")

    # 1. Coleta novos editais
    editais_novos = buscar_novos_editais()

    # 2. Salva no histórico do mês atual
    for tema in ['mestrado', 'doutorado', 'aluno-especial']:
        print(f"Salvando editais recentes no histórico: {tema} ({len(editais_novos[tema])} editais)")
        try:
            salvar_historico_edital(tema, editais_novos[tema])
        except Exception as e:
            print(f"Aviso ao salvar histórico do tema '{tema}': {e}")

    # 3. Consolida os arquivos históricos anuais
    consolidar_todos_anos()

    # 4. Gera a compilação geral dos editais abertos
    gerar_ultimos_editais()

    # 5. Atualiza métricas estatísticas de toda a base histórica
    gerar_metricas()

    print("--- Compilador de Editais Bahia finalizado com sucesso! ---")


if __name__ == '__main__':
    executar_compilador()
