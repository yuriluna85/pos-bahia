import os
import re
import json
import html
import csv
import urllib.request
import urllib.parse
import ssl
import unicodedata
from datetime import datetime, timedelta

# Helper para realizar requisições HTTP
def http_request(url, method='GET', headers=None, data=None, use_fallback=True):
    if headers is None:
        headers = {}
    
    # Identifica se já é um serviço de API para evitar loops recursivos
    is_api_service = "api.scraperapi.com" in url or "google.serper.dev" in url
    
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
            raw_bytes = response.read()
            
            # Detect charset
            charset = 'utf-8'
            content_type = response_headers.get('Content-Type', '').lower()
            if 'charset=' in content_type:
                parts = content_type.split('charset=')
                if len(parts) > 1:
                    charset = parts[1].split(';')[0].strip()
            
            try:
                response_data = raw_bytes.decode(charset)
            except Exception:
                # Se falhar com o charset detectado, tenta utf-8 e depois latin-1
                try:
                    response_data = raw_bytes.decode('utf-8')
                except Exception:
                    response_data = raw_bytes.decode('latin-1', errors='ignore')
                
            return {
                'statusCode': status_code,
                'headers': response_headers,
                'data': response_data
            }
    except Exception as e:
        scraper_key = os.environ.get('SCRAPER_API_KEY')
        if use_fallback and scraper_key and not is_api_service:
            print(f"[Fallback Proxy] Requisição direta falhou para {url} (Erro: {e}). Tentando via ScraperAPI...")
            scraper_url = f"https://api.scraperapi.com/?api_key={scraper_key}&url={urllib.parse.quote(url)}&render=true"
            try:
                return http_request(scraper_url, method='GET', use_fallback=False)
            except Exception as e_fallback:
                print(f"[Fallback Proxy] Falha também através do proxy ScraperAPI para {url}: {e_fallback}")
                raise e_fallback
        else:
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

def remover_acentos_py(txt):
    if not txt:
        return ""
    return "".join(c for c in unicodedata.normalize('NFD', txt) if unicodedata.category(c) != 'Mn')

def corrigir_campos_edital(e):
    """Corrige codificação em todos os campos de texto de um objeto edital e enriquece com metadados de classificação."""
    e['titulo'] = normalizar_titulo(corrigir_utf8_corrompido(e.get('titulo', '')))
    e['resumo'] = corrigir_utf8_corrompido(e.get('resumo', ''))
    e['instituicao'] = corrigir_utf8_corrompido(e.get('instituicao', ''))
    e['area'] = corrigir_utf8_corrompido(e.get('area', ''))
    e['nivel'] = corrigir_utf8_corrompido(e.get('nivel', ''))

    # Enriquecimento com classificações (Stricto/Lato, Modalidade, EPT e Gratuidade)
    titulo_lower = remover_acentos_py(e['titulo'].lower())
    resumo_lower = remover_acentos_py(e['resumo'].lower())
    nivel_lower = remover_acentos_py(e['nivel'].lower())
    texto_completo = f"{titulo_lower} {resumo_lower} {nivel_lower}"

    # 1. Tipo e Subtipo de Pós
    if any(x in texto_completo for x in ['especializacao', 'lato sensu', 'lato-sensu', 'mba', 'especialista']):
        tipo_pos = 'Lato'
        subtipo_pos = 'Especialização'
    elif any(x in texto_completo for x in ['pos-doc', 'pos doc', 'pos-doutorado', 'pos doutorado', 'recem-doutor']):
        tipo_pos = 'Stricto'
        subtipo_pos = 'Pós-Doc'
    elif 'doutorado' in texto_completo or 'doutor' in texto_completo:
        tipo_pos = 'Stricto'
        subtipo_pos = 'Doutorado'
    elif 'mestrado' in texto_completo or 'mestre' in texto_completo:
        tipo_pos = 'Stricto'
        subtipo_pos = 'Mestrado'
    else:
        # Fallback baseado no nível original
        if 'especializ' in nivel_lower:
            tipo_pos = 'Lato'
            subtipo_pos = 'Especialização'
        elif 'doutor' in nivel_lower:
            tipo_pos = 'Stricto'
            subtipo_pos = 'Doutorado'
        elif 'pos-doc' in nivel_lower or 'pos doc' in nivel_lower:
            tipo_pos = 'Stricto'
            subtipo_pos = 'Pós-Doc'
        else:
            tipo_pos = 'Stricto'
            subtipo_pos = 'Mestrado'

    # 2. Modalidade (EaD vs Presencial)
    if any(x in texto_completo for x in ['ead', 'a distancia', 'a distância', 'virtual', 'online', 'semi-presencial', 'semipresencial']):
        modalidade = 'EaD'
    elif any(x in texto_completo for x in ['uab', 'universidade aberta']):
        modalidade = 'EaD'
    else:
        modalidade = 'Presencial'

    # 3. Pós na EPT (is_ept)
    if any(x in texto_completo for x in ['ept', 'educacao profissional e tecnologica', 'educacao profissional', 'profept', 'gestao na ept', 'docencia na ept', 'docencia para ept', 'gestao em ept', 'docencia em ept']):
        is_ept = True
    else:
        is_ept = False

    # 4. Gratuidade (Gratuita vs Paga)
    if tipo_pos == 'Stricto':
        gratuidade = 'Gratuita'
    else:
        termos_pagos = ['mensalidade', 'mensais', 'parcelas', 'taxa de matricula', 'investimento', 'curso pago', 'valor do curso', 'pago', 'pagas']
        if any(x in texto_completo for x in termos_pagos) and not any(x in texto_completo for x in ['isencao', 'gratuito', 'gratuita', 'sem custo']):
            gratuidade = 'Paga'
        else:
            if any(x in e.get('instituicao', '').lower() for x in ['if baiano', 'ifbaiano', 'ifba']) or 'uab' in texto_completo or 'gratuito' in texto_completo or 'gratuita' in texto_completo:
                gratuidade = 'Gratuita'
            else:
                if any(x in e.get('instituicao', '').lower() for x in ['ufba', 'uneb']):
                    gratuidade = 'Paga'
                else:
                    gratuidade = 'Gratuita'

    e['tipo_pos'] = tipo_pos
    e['subtipo_pos'] = subtipo_pos
    e['modalidade'] = modalidade
    e['is_ept'] = is_ept
    e['gratuidade'] = gratuidade
    return e


# Salva histórico mensal em formato JSON e CSV
def salvar_historico_edital(tema, editais, data_especifica=None):
    if not editais:
        return

    # Corrige todos os novos editais antes de salvar
    editais = [corrigir_campos_edital(e) for e in editais]

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
        index = next((i for i, h in enumerate(historico_dia) if h['url'] == e['url'] and normalizar_chave_dedup(h['titulo']) == normalizar_chave_dedup(e['titulo'])), -1)
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

    for tema in ['mestrado', 'doutorado', 'aluno-especial', 'especializacao']:
        todos_tema = []
        for mes in meses:
            nome_mes = NOMES_MESES[int(mes) - 1]
            json_path = os.path.join(ano_dir, mes, f"{tema}-{nome_mes}-{ano}.json")
            if os.path.exists(json_path):
                try:
                    with open(json_path, 'r', encoding='utf-8') as f:
                        content = json.load(f)
                        if isinstance(content, list):
                            todos_tema.extend([corrigir_campos_edital(e) for e in content])
                except Exception as e:
                    print(f"Erro ao ler arquivo {json_path} para consolidação anual: {e}")

        # Deduplicar mantendo o de maior prazo
        mapa_editais = {}
        for e in todos_tema:
            # Chave baseada em Titulo e URL
            chave = f"{normalizar_chave_dedup(e['titulo'])}-{e['url']}"
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
                    todos_editais.extend([corrigir_campos_edital(e) for e in content])
        except Exception as e:
            print(f"Erro ao ler arquivo para métricas: {file} - {e}")

    # Deduplicar
    chaves_unicas = set()
    editais_unicos = []
    for e in todos_editais:
        chave = f"{normalizar_chave_dedup(e['titulo'])}-{e['url']}"
        if chave not in chaves_unicas:
            chaves_unicas.add(chave)
            editais_unicos.append(e)

    total_geral = len(editais_unicos)

    totais_niveis = {
        'Mestrado Acadêmico': 0,
        'Mestrado Profissional': 0,
        'Doutorado Acadêmico': 0,
        'Doutorado Profissional': 0,
        'Aluno Especial': 0,
        'Especialização': 0,
        'Pós-Doc': 0
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
                    todos_editais.extend([corrigir_campos_edital(e) for e in content])
        except Exception as e:
            print(f"Erro ao ler arquivo para ultimos-editais: {file} - {e}")

    # Deduplicar mantendo o prazo final mais longo
    mapa_editais = {}
    for e in todos_editais:
        chave = f"{normalizar_chave_dedup(e['titulo'])}-{e['url']}"
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
                clean_text = clean_text.replace('\ufffd', '').replace('\xa0', ' ')
                clean_text = re.sub(r'\s+', ' ', clean_text).strip()
                if clean_text:
                    current_edital = clean_text
                continue
            
            td_regex = re.compile(r'<td\b[^>]*>([\s\S]*?)<\/td>', re.IGNORECASE)
            tds = []
            for td_match in td_regex.finditer(tr_content):
                clean_td = html.unescape(td_match.group(1))
                clean_td = re.sub(r'<[^>]*>', ' ', clean_td)
                clean_td = re.sub(r'\s+', ' ', clean_td).strip()
                tds.append(clean_td)
            
            if len(tds) >= 3:
                # Localiza dinamicamente qual coluna contém o período de inscrições
                period_idx = -1
                for idx, td in enumerate(tds):
                    if re.search(r'\d{2}/\d{2}/\d{4}', td):
                        period_idx = idx
                        break
                
                if period_idx != -1:
                    course = html.unescape(tds[0]).strip()
                    course = re.sub(r'\s+', ' ', course)
                    course = corrigir_utf8_corrompido(course)
                    course = course.replace('\xa0', ' ')
                    
                    period_raw = tds[period_idx]
                    vacancies_raw = tds[period_idx - 1] if period_idx > 0 else "10"
                    
                    edital_nome = current_edital if current_edital else f"Processo Seletivo {sigla}"
                    edital_nome = corrigir_utf8_corrompido(edital_nome)
                    
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
                    
                    # Identificação de Aluno Especial
                    aluno_especial_terms = [
                        "aluno especial", "aluno de matricula especial", "aluno de matrícula especial", 
                        "matricula especial", "matrícula especial", "estudante especial", 
                        "disciplina isolada", "disciplinas isoladas", "vaga isolada", "vagas isoladas", 
                        "estudante isolado", "aluno/a especial"
                    ]
                    combined_lower = f"{edital_nome} {course}".lower()
                    eh_especial = any(x in combined_lower for x in aluno_especial_terms)
                    
                    nivel_base = "Mestrado"
                    if "doutorado" in combined_lower:
                        nivel_base = "Doutorado"
                    
                    tipo = "Acadêmico"
                    if "profissional" in combined_lower:
                        tipo = "Profissional"
                    
                    if eh_especial:
                        nivel = f"{nivel_base} - Aluno Especial"
                        pasta_tema = "aluno-especial" # Mantém compatibilidade de pasta por enquanto
                    else:
                        nivel = f"{nivel_base} {tipo}"
                        pasta_tema = nivel_base.lower()
                    
                    area = "Saúde e Biológicas"
                    max_contagem = 0
                    for tema_nome, keywords in TEMAS_INTERESSE.items():
                        contagem = sum(len(re.findall(r'\b' + re.escape(kw) + r'\b', combined_lower)) for kw in keywords)
                        if contagem > max_contagem:
                            max_contagem = contagem
                            area = tema_nome
                    
                    titulo_edital = f"{edital_nome} - {course}"
                    titulo_edital = normalizar_titulo(titulo_edital)
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


def corrigir_utf8_corrompido(texto):
    if not texto:
        return texto
    
    # 1. Tenta o fix global (mais rápido e limpo)
    try:
        # Padrões de mojibake comuns (UTF-8 lido como Latin-1)
        patterns = [
            '\xc3\xa7', '\xc3\xa3', '\xc3\xa1', '\xc3\xb3', '\xc3\xaa',
            '\xc3\xa9', '\xc3\xba', '\xc3\xad', '\xc3\xa0', '\xc3\xa2',
            '\xc3\xb5', '\xc3\x98', '\xc3\x89', '\xc3\x93', '\xc3\x81',
            '\xc3\x8a', '\xc3\x82', '\xc3\x80', '\xc3\x8d', '\xc3\x9a',
            '\xc3\x95', '\xc3\x91'
        ]
        if any(x in texto for x in patterns):
            return texto.encode('latin-1').decode('utf-8')
    except Exception:
        # 2. Se falhar (por bytes isolados que quebram o decode), tenta fix cirúrgico via regex
        def fix_match(m):
            try:
                return m.group(0).encode('latin-1').decode('utf-8')
            except:
                return m.group(0)
        
        # Corrige sequências de 2 bytes UTF-8 (Ã ou Â seguidos de byte de continuação)
        texto = re.sub(r'[\u00c2-\u00c3][\u0080-\u00bf]', fix_match, texto)
        
    # 3. Recuperação de caracteres "Ã" isolados (mesmo se o fix global funcionou ou foi pulado)
    # Comum em: Ãridos -> Áridos, Ãrea -> Área
    texto = texto.replace('\u00c3ridos', 'Áridos').replace('\u00c3rea', 'Área').replace('\u00c3\u0081', 'Á')
    # Caso geral: Ã seguido de consoante costuma ser Á
    texto = re.sub(r'\u00c3(?=[rR]idos)', 'Á', texto)
    texto = re.sub(r'\u00c3(?=[rR]ea)', 'Á', texto)
    
    # 4. Limpeza final de caracteres residuais
    texto = texto.replace('\ufffd', '').strip()
    return texto


def normalizar_titulo(texto):
    """Normalizes a title for deduplication: strips NBSP, replacement chars and extra spaces."""
    if not texto:
        return ''
    texto = texto.replace('\xa0', ' ').replace('\u00a0', ' ').replace('\ufffd', '')
    texto = re.sub(r'\s+', ' ', texto)
    return texto.strip()


def normalizar_chave_dedup(titulo):
    """Full normalization for dedup key: fixes encoding AND normalizes whitespace.
    Ensures 'GestÃ£o' and 'Gestão' are treated as the same edital."""
    return normalizar_titulo(corrigir_utf8_corrompido(titulo))

# ══ RASPADOR DIRETO E INTEGRADO DA UNEB SSPPG ══
def raspar_uneb_ssppg():
    print("[UNEB SSPPG] Buscando processos seletivos diretamente de: https://ssppg.uneb.br")
    editais_encontrados = []
    hoje = datetime.now()
    
    try:
        response = http_request(
            'https://ssppg.uneb.br',
            method='GET',
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        )
        
        if response['statusCode'] != 200:
            print(f"[UNEB SSPPG] Erro ao acessar. Status: {response['statusCode']}")
            return []
            
        html_content = response['data']
        
        # Encontra os links e títulos correspondentes na listagem inicial (com [\s\S]*? para suportar novas linhas)
        pattern = re.compile(
            r'href=["\'](/inicio/editalExterno/\d+\?selecao=\d+)["\'][^>]*>[\s\S]*?<h5[^>]*>[\s\S]*?<strong>\s*([\s\S]*?)\s*</strong>[\s\S]*?</h5>',
            re.IGNORECASE
        )
        
        matches = pattern.findall(html_content)
        print(f"[UNEB SSPPG] Encontrados {len(matches)} links de editais na página inicial.")
        
        for path, full_title in matches:
            full_title = html.unescape(full_title).strip()
            full_title = re.sub(r'\s+', ' ', full_title)
            full_title = corrigir_utf8_corrompido(full_title)
            full_title = full_title.replace('\x81', '').replace('\xa0', ' ').strip()
            
            url_edital = f"https://ssppg.uneb.br{path}"
            print(f"[UNEB SSPPG] Buscando detalhes de: {full_title}")
            
            try:
                detail_res = http_request(
                    url_edital,
                    method='GET',
                    headers={
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                )
                
                start_dt = hoje
                end_dt = hoje + timedelta(days=15)
                period_str = "período não especificado"
                
                if detail_res['statusCode'] == 200:
                    detail_html = detail_res['data']
                    # Padrão: Período de Inscrições - DD/MM/YYYY a DD/MM/YYYY ou similar
                    date_pattern = re.search(
                        r'Período de Inscrições\s*-\s*(\d{2}/\d{2}/\d{4})[\s\S]*?(?:a|à)\s*(\d{2}/\d{2}/\d{4})',
                        detail_html,
                        re.IGNORECASE
                    )
                    if date_pattern:
                        start_str = date_pattern.group(1)
                        end_str = date_pattern.group(2)
                        period_str = f"{start_str} a {end_str}"
                        try:
                            start_dt = datetime.strptime(start_str.strip(), "%d/%m/%Y")
                            end_dt = datetime.strptime(end_str.strip(), "%d/%m/%Y")
                            start_dt = start_dt.replace(hour=12, minute=0, second=0)
                            end_dt = end_dt.replace(hour=23, minute=59, second=59)
                        except Exception as ex:
                            print(f"[UNEB SSPPG] Erro ao parsear data ({start_str} ou {end_str}): {ex}")
                
                # Ignora editais encerrados muito antigos
                limite_historico = datetime(2026, 6, 1, 0, 0, 0)
                if end_dt < limite_historico:
                    continue
                    
                status = "Aberto" if end_dt >= hoje else "Encerrado"
                
                # Identificação de Aluno Especial
                aluno_especial_terms = [
                    "aluno especial", "aluno de matricula especial", "aluno de matrícula especial", 
                    "matricula especial", "matrícula especial", "estudante especial", 
                    "ae", "aluno/a especial"
                ]
                combined_lower = full_title.lower()
                eh_especial = any(x in combined_lower for x in aluno_especial_terms) or re.search(r'\bAE\b', full_title) or "2026ae" in combined_lower
                
                nivel_base = "Mestrado"
                if "doutorado" in combined_lower:
                    nivel_base = "Doutorado"
                
                tipo = "Acadêmico"
                if any(x in combined_lower for x in ["profissional", "gestec", "mpeja", "profept"]):
                    tipo = "Profissional"
                
                if eh_especial:
                    nivel = f"{nivel_base} - Aluno Especial"
                elif "lato sensu" in combined_lower or "especialização" in combined_lower or "especializacao" in combined_lower:
                    nivel = f"{nivel_base} Profissional"
                else:
                    nivel = f"{nivel_base} {tipo}"
                
                area = "Educação"
                max_contagem = 0
                for tema_nome, keywords in TEMAS_INTERESSE.items():
                    contagem = sum(len(re.findall(r'\b' + re.escape(kw) + r'\b', combined_lower)) for kw in keywords)
                    if contagem > max_contagem:
                        max_contagem = contagem
                        area = tema_nome
                
                if "gestec" in combined_lower or "tecnologias" in combined_lower:
                    area = "Tecnologia e Informática"
                elif "linguagens" in combined_lower or "letras" in combined_lower or "ppgel" in combined_lower:
                    area = "Humanas e Sociais"
                
                resumo_edital = f"Inscrições para o processo seletivo da UNEB: {full_title}. Período de inscrições de {period_str}. Consulte o edital completo no portal SSPPG UNEB."
                
                editais_encontrados.append({
                    'titulo': full_title[:150],
                    'resumo': resumo_edital[:350],
                    'instituicao': 'UNEB',
                    'nivel': nivel,
                    'area': area,
                    'vagas': 15,
                    'inscricoesInicio': start_dt.isoformat() + 'Z',
                    'inscricoesFim': end_dt.isoformat() + 'Z',
                    'url': url_edital,
                    'status': status,
                    'dataPublicacao': start_dt.isoformat() + 'Z',
                    'fonte': "UNEB SSPPG"
                })
            except Exception as e_detail:
                print(f"[UNEB SSPPG] Erro ao buscar detalhes para {url_edital}: {e_detail}")
    except Exception as e:
        print(f"[UNEB SSPPG] Falha na raspagem direta: {e}")
        
    return editais_encontrados


# Busca novos editais nos portais SIGAA, SSPPG e Google Serper
def buscar_novos_editais():
    print("Iniciando busca nos portais SIGAA, SSPPG e Google Serper...")
    
    resultados = {
        'mestrado': [],
        'doutorado': [],
        'aluno-especial': [],
        'especializacao': []
    }

    # 1. Busca dinâmica no Google via Serper.dev se as chaves de API estiverem presentes
    serper_key = os.environ.get('SERPER_API_KEY')
    scraper_key = os.environ.get('SCRAPER_API_KEY')
    
    if serper_key and scraper_key:
        print("Chaves de API encontradas. Iniciando busca adicional no Google via Serper.dev...")
        ano_corrente = datetime.now().year
        queries = [
            # Stricto Sensu (Foco na Bahia)
            f'site:ufba.br OR site:ufrb.edu.br OR site:ufsb.edu.br OR site:ufob.edu.br OR site:univasf.edu.br "mestrado" OR "doutorado" OR "aluno especial" {ano_corrente}',
            f'site:uneb.br OR site:uefs.br OR site:uesc.br OR site:uesb.br OR site:ifba.edu.br OR site:ifbaiano.edu.br "mestrado" OR "doutorado" OR "aluno especial" {ano_corrente}',
            f'site:unifacs.br OR site:ucsal.br OR site:unijorge.edu.br OR site:uniftc.edu.br "mestrado" OR "doutorado" OR "aluno especial" {ano_corrente}',
            # Lato Sensu (Especializações - Qualquer localidade do Brasil, de preferência EaD)
            f'site:.edu.br "edital" "especialização" "inscrições abertas" "ead" OR "a distância" {ano_corrente}',
            f'site:.gov.br OR site:.org.br "processo seletivo" "lato sensu" "especialização" "ead" {ano_corrente}'
        ]
        
        links_processados = set()
        hoje = datetime.now()
        
        for query in queries:
            try:
                print(f"Buscando no Google: \"{query}\"")
                search_res = http_request(
                    'https://google.serper.dev/search',
                    method='POST',
                    headers={
                        'X-API-KEY': serper_key,
                        'Content-Type': 'application/json'
                    },
                    data={
                        'q': query,
                        'gl': 'br',
                        'hl': 'pt-br'
                    },
                    use_fallback=False
                )
                
                if search_res['statusCode'] == 200:
                    search_data = json.loads(search_res['data'])
                    items = search_data.get('organic', [])
                    
                    for item in items[:5]:
                        url = item.get('link')
                        if not url or url in links_processados:
                            continue
                        links_processados.add(url)
                        
                        instituicao = 'UFBA'
                        encontrada = False
                        for inst, site in SITES_INSTITUICOES.items():
                            clean_site = site.replace('https://', '').replace('http://', '').replace('www.', '').lower().strip('/')
                            if clean_site in url.lower():
                                instituicao = inst
                                encontrada = True
                                break
                                
                        if not encontrada:
                            # Deduz a sigla a partir da URL da instituição nacional
                            try:
                                parsed_url = urllib.parse.urlparse(url)
                                domain_parts = parsed_url.netloc.lower().split('.')
                                sigla_extraida = domain_parts[1].upper() if domain_parts[0] == 'www' and len(domain_parts) > 1 else domain_parts[0].upper()
                                instituicao = sigla_extraida
                            except Exception:
                                instituicao = 'Nacional'
                            
                        print(f"[Serper] Processando URL: {url} (Sigla: {instituicao})")
                        
                        try:
                            scraper_url = f"https://api.scraperapi.com/?api_key={scraper_key}&url={urllib.parse.quote(url)}&render=true"
                            scrape_res = http_request(scraper_url, method='GET', use_fallback=False)
                            
                            if scrape_res['statusCode'] == 200:
                                html_data = scrape_res['data']
                                
                                titulo = item.get('title', 'Processo Seletivo')
                                title_match = re.search(r'<title>(.*?)<\/title>', html_data, re.IGNORECASE)
                                if title_match:
                                    titulo = title_match.group(1).strip()
                                
                                # Remove <script>, <style> e seus conteúdos antes de processar o texto
                                text_content = re.sub(r'<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>', ' ', html_data, flags=re.IGNORECASE | re.DOTALL)
                                text_content = re.sub(r'<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>', ' ', text_content, flags=re.IGNORECASE | re.DOTALL)
                                text_content = re.sub(r'<[^>]*>', ' ', text_content)
                                text_content = re.sub(r'\s+', ' ', text_content).strip()
                                text_lower = text_content.lower()
                                
                                # Sanitiza o título: elimina qualquer resíduos de JS (ex: "function dpf(f){...}")
                                titulo = html.unescape(titulo)
                                titulo = re.sub(r'function\s+\w+\s*\([^)]*\)\s*\{[^}]*\}', '', titulo, flags=re.IGNORECASE)
                                titulo = re.sub(r'var\s+\w+\s*=\s*[^;]+;', '', titulo)
                                titulo = re.sub(r'\b(?:if|for|while|return|var|let|const|function)\b.*', '', titulo)
                                titulo = re.sub(r'[{};]', '', titulo)
                                titulo = re.sub(r'\s+', ' ', titulo).strip()
                                # Se o título resultante estiver vazio ou parecer código, usa snippet do Serper
                                if not titulo or len(titulo) < 10 or '{' in titulo or 'function' in titulo.lower():
                                    titulo = item.get('snippet', item.get('title', 'Processo Seletivo'))[:120]
                                titulo = corrigir_utf8_corrompido(titulo)
                                
                                nivel = "Mestrado Acadêmico"
                                if any(x in text_lower for x in ["aluno especial", "matricula especial", "estudante especial", "disciplina isolada"]):
                                    nivel = "Mestrado - Aluno Especial"
                                elif "doutorado" in text_lower:
                                    nivel = "Doutorado Profissional" if "doutorado profissional" in text_lower else "Doutorado Acadêmico"
                                elif "especialização" in text_lower or "especializacao" in text_lower or "lato sensu" in text_lower:
                                    nivel = "Especialização"
                                elif "mestrado" in text_lower:
                                    nivel = "Mestrado Profissional" if "mestrado profissional" in text_lower else "Mestrado Acadêmico"
                                    
                                is_lato = (nivel == "Especialização")
                                
                                # REGRA DE LOCALIDADE: Se for edital Stricto Sensu (Mestrado/Doutorado/Aluno Especial) e não pertencer a uma instituição da Bahia, nós o descartamos!
                                if not is_lato and not encontrada:
                                    print(f"[Serper] Ignorando edital Stricto Sensu fora da Bahia: {url}")
                                    continue
                                    
                                area = "Saúde e Biológicas"
                                max_contagem = 0
                                for tema_nome, keywords in TEMAS_INTERESSE.items():
                                    contagem = sum(len(re.findall(r'\b' + re.escape(kw) + r'\b', text_lower)) for kw in keywords)
                                    if contagem > max_contagem:
                                        max_contagem = contagem
                                        area = tema_nome
                                        
                                date_regex = re.compile(r'\b(\d{2})/(\d{2})/(\d{4})\b')
                                dates = []
                                for m in date_regex.finditer(text_content):
                                    day = int(m.group(1))
                                    month = int(m.group(2))
                                    year = int(m.group(3))
                                    try:
                                        parsed_date = datetime(year, month, day)
                                        if year >= ano_corrente:
                                            dates.append(parsed_date)
                                    except Exception:
                                        pass
                                        
                                if len(dates) < 2:
                                    print(f"[Serper] Ignorando {url} - Datas insuficientes para o ano {ano_corrente}.")
                                    continue
                                    
                                dates.sort()
                                start_dt = dates[0]
                                end_dt = dates[-1]
                                
                                limite_historico = hoje - timedelta(days=30)
                                if end_dt < limite_historico:
                                    continue
                                    
                                status = "Aberto" if end_dt >= hoje else "Encerrado"
                                resumo = item.get('snippet', f"Processo seletivo aberto para ingresso no programa de pós-graduação. Confira o edital oficial da instituição {instituicao} para mais detalhes.").strip()
                                
                                edital_dados = {
                                    'titulo': normalizar_titulo(titulo[:150]),
                                    'resumo': resumo[:350],
                                    'instituicao': instituicao,
                                    'nivel': nivel,
                                    'area': area,
                                    'vagas': 10,
                                    'inscricoesInicio': start_dt.isoformat() + 'Z',
                                    'inscricoesFim': end_dt.isoformat() + 'Z',
                                    'url': url,
                                    'status': status,
                                    'dataPublicacao': start_dt.isoformat() + 'Z',
                                    'fonte': f"Google Search ({instituicao})"
                                }
                                
                                edital_dados = corrigir_campos_edital(edital_dados)
                                
                                if edital_dados.get('tipo_pos') == 'Lato' or edital_dados['nivel'] == 'Especialização':
                                    pasta = "especializacao"
                                elif "Aluno Especial" in edital_dados['nivel']:
                                    pasta = "aluno-especial"
                                elif edital_dados['nivel'].startswith("Doutorado"):
                                    pasta = "doutorado"
                                else:
                                    pasta = "mestrado"
                                    
                                ja_existe = any(x['titulo'] == edital_dados['titulo'] for x in resultados[pasta])
                                if not ja_existe:
                                    resultados[pasta].append(edital_dados)
                                    print(f"[Serper] Novo edital adicionado em '{pasta}': {edital_dados['titulo']}")
                        except Exception as e_scrape:
                            print(f"[Serper] Erro ao processar a URL {url}: {e_scrape}")
            except Exception as e_search:
                print(f"[Serper] Erro na busca do Google: {e_search}")
    else:
        print("Chaves SERPER_API_KEY ou SCRAPER_API_KEY ausentes. A busca Google adicional foi desativada.")

    # 2. Raspagem dos Portais SIGAA
    sigaa_portais = [
        # Stricto Sensu
        { 'sigla': 'UFBA', 'url': 'https://sigaa.ufba.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=S' },
        { 'sigla': 'UFRB', 'url': 'https://sistemas.ufrb.edu.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=S' },
        { 'sigla': 'UFSB', 'url': 'https://sig.ufsb.edu.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=S' },
        { 'sigla': 'UFOB', 'url': 'https://sig.ufob.edu.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=S' },
        { 'sigla': 'UNILAB', 'url': 'https://sigaa.unilab.edu.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=S' },
        # Lato Sensu
        { 'sigla': 'UFBA', 'url': 'https://sigaa.ufba.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=L' },
        { 'sigla': 'UFRB', 'url': 'https://sistemas.ufrb.edu.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=L' },
        { 'sigla': 'UFSB', 'url': 'https://sig.ufsb.edu.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=L' },
        { 'sigla': 'UFOB', 'url': 'https://sig.ufob.edu.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=L' },
        { 'sigla': 'UNILAB', 'url': 'https://sigaa.unilab.edu.br/sigaa/public/processo_seletivo/lista.jsf?aba=p-processo&nivel=L' }
    ]
    
    for portal in sigaa_portais:
        try:
            portal_editais = raspar_sigaa_portal_direct(portal['sigla'], portal['url'])
            print(f"[{portal['sigla']} SIGAA] Encontrados {len(portal_editais)} editais reais.")
            for ed in portal_editais:
                ed = corrigir_campos_edital(ed)
                # Classifica para a pasta correta
                if ed.get('tipo_pos') == 'Lato' or ed['nivel'] == 'Especialização':
                    pasta = "especializacao"
                elif "Aluno Especial" in ed['nivel']:
                    pasta = "aluno-especial"
                elif ed['nivel'].startswith("Doutorado"):
                    pasta = "doutorado"
                else:
                    pasta = "mestrado"
                
                ja_existe = any(x['titulo'] == ed['titulo'] for x in resultados[pasta])
                if not ja_existe:
                    resultados[pasta].append(ed)
        except Exception as e:
            print(f"Erro ao raspar SIGAA {portal['sigla']} diretamente: {e}")

    # 2. Raspagem do Portal SSPPG da UNEB
    try:
        uneb_editais = raspar_uneb_ssppg()
        print(f"[UNEB SSPPG] Encontrados {len(uneb_editais)} editais reais.")
        for ed in uneb_editais:
            ed = corrigir_campos_edital(ed)
            if ed.get('tipo_pos') == 'Lato' or ed['nivel'] == 'Especialização':
                pasta = "especializacao"
            elif "Aluno Especial" in ed['nivel']:
                pasta = "aluno-especial"
            elif ed['nivel'].startswith("Doutorado"):
                pasta = "doutorado"
            else:
                pasta = "mestrado"
            
            ja_existe = any(x['titulo'] == ed['titulo'] for x in resultados[pasta])
            if not ja_existe:
                resultados[pasta].append(ed)
    except Exception as e:
        print(f"Erro ao raspar UNEB SSPPG diretamente: {e}")

    return resultados



# Simulação de busca com dados de fallbacks
def buscar_novos_editais_simulados():
    print("Simulação desativada. Retornando dados vazios.")
    return {
        'mestrado': [],
        'doutorado': [],
        'aluno-especial': [],
        'especializacao': []
    }



# Execução Principal do Compilador
def executar_compilador():
    print(f"--- Iniciando Compilador de Editais da Bahia (Python) ({datetime.now().strftime('%d/%m/%Y, %H:%M:%S')}) ---")

    # 1. Coleta novos editais
    editais_novos = buscar_novos_editais()

    # 2. Salva no histórico do mês atual
    for tema in ['mestrado', 'doutorado', 'aluno-especial', 'especializacao']:
        print(f"Salvando editais recentes no histórico: {tema} ({len(editais_novos[tema])} editais)")
        try:
            salvar_historico_edital(tema, editais_novos[tema])
        except Exception as e:
            print(f"Aviso ao salvar histórico do tema '{tema}': {e}")

    # 3. Consolida os arquivos históricos anuais
    consolidar_todos_anos()

    # 4. Gera a compilação geral dos editais abertos
    gerar_editais_consolidados = gerar_ultimos_editais()

    # 5. Atualiza métricas estatísticas de toda a base histórica
    gerar_metricas()

    print("--- Compilador de Editais Bahia finalizado com sucesso! ---")


if __name__ == '__main__':
    executar_compilador()
