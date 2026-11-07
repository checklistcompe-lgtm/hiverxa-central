# Central de reportes

Prototipo web para localizar, editar y generar vista previa/PDF de checklists y actas de entrega.

## Ejecutar

Desde esta carpeta:

```powershell
python -m http.server 8080
```

Abrir `http://localhost:8080`.

## Estado actual

La interfaz usa datos de demostración guardados en el navegador (`localStorage`). Los cambios son locales; todavía faltan las conexiones reales a Google Sheets, Google Drive y Firebase.

## Próximos pasos

1. Crear el backend/API segura.
2. Conectar Google Sheets y Google Drive mediante una cuenta técnica.
3. Conectar Firebase/Firestore.
4. Reemplazar los datos locales por datos reales.
5. Guardar PDFs generados con versiones y registro de auditoría.
