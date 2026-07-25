import zipfile
import xml.etree.ElementTree as ET
import glob

with open('context_output.txt', 'w', encoding='utf-8') as f_out:
    for filename in glob.glob('context/*.docx'):
        f_out.write(f"\n\n{'='*20}\n--- {filename} ---\n{'='*20}\n")
        try:
            with zipfile.ZipFile(filename) as docx:
                xml_content = docx.read('word/document.xml')
                tree = ET.XML(xml_content)
                namespace = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                
                # Extract text maintaining some structure
                texts = []
                for p in tree.findall('.//w:p', namespace):
                    p_text = ''.join([node.text for node in p.findall('.//w:t', namespace) if node.text])
                    if p_text:
                        texts.append(p_text)
                
                f_out.write('\n'.join(texts))
        except Exception as e:
            f_out.write(f"Error reading {filename}: {e}")
